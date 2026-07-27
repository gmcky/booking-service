import { prisma } from "../../shared/lib/prisma.js";
import { AppError } from "../../shared/middlewares/error.handler.js";
import { logger } from "../../shared/lib/logger.js";
import { stripe } from "../../shared/lib/stripe.js";
import { env } from "../../config/env.js";
import { emailQueue } from "../../shared/queues/email.queue.js";
import { formatDate } from "./payment.helpers.js";
import type { CreatePaymentInput, CreatePaymentIntentInput } from "./payment.types.js";

export class PaymentIntentService {
  /**
   * Validate booking ownership/state and upsert pending payment stub.
   */
  static async createIntent(data: CreatePaymentIntentInput, userId: string) {
    const booking = await prisma.booking.findUnique({
      where: { id: data.bookingId },
      include: { payment: true },
    });

    if (!booking) {
      throw new AppError(404, "Booking not found");
    }

    if (booking.userId !== userId) {
      throw new AppError(403, "Not authorized");
    }

    if (booking.status !== "PENDING") {
      throw new AppError(400, "Only pending bookings can be paid");
    }

    if (booking.payment?.status === "SUCCESS") {
      throw new AppError(400, "Booking is already paid");
    }

    // Fail before card entry when the race is already lost. Advisory only —
    // the capture webhook re-checks inside a serializable tx either way.
    const confirmedOverlap = await prisma.booking.count({
      where: {
        propertyId: booking.propertyId,
        status: "CONFIRMED",
        checkIn: { lt: booking.checkOut },
        checkOut: { gt: booking.checkIn },
        id: { not: booking.id },
      },
    });
    if (confirmedOverlap > 0) {
      throw new AppError(409, "These dates were just booked by another guest");
    }

    const amountInCents = Math.round(Number(booking.totalPrice) * 100);
    if (!Number.isFinite(amountInCents) || amountInCents <= 0) {
      logger.error(
        { bookingId: booking.id, totalPrice: String(booking.totalPrice) },
        "Invalid booking amount for payment intent",
      );
      throw new AppError(400, "Invalid booking amount");
    }

    if (!env.STRIPE_SECRET_KEY) {
      throw new AppError(500, "Stripe is not configured");
    }

    let paymentIntent;
    try {
      paymentIntent = await stripe.paymentIntents.create(
        {
          amount: amountInCents,
          currency: "usd",
          // Authorize now, capture only after the booking wins the confirm
          // race in the webhook. A losing authorization is voided — no money
          // moves and no processing fee accrues, unlike charge-then-refund.
          capture_method: "manual",
          // Only what this flow has actually been exercised with. Left to the
          // dashboard's defaults, Stripe also offered Klarna, Affirm, Link and
          // Amazon Pay here — methods whose asynchronous states nothing in the
          // confirm-race path has ever seen. Cash App Pay showed what an
          // unexercised method costs: it delivered its authorization webhook
          // twice and three paid stays were cancelled and refunded before the
          // cause was found. Widening this list means walking a real payment
          // through the method first.
          payment_method_types: ["card", "cashapp"],
          metadata: {
            bookingId: booking.id,
            userId,
          },
        },
        {
          // Amount in the key: a rescheduled (repriced) booking must mint a
          // fresh intent instead of replaying the stale-amount one.
          idempotencyKey: `intent_${booking.id}_${amountInCents}`,
        },
      );
    } catch (error) {
      logger.error(
        { error, bookingId: booking.id, amountInCents },
        "Failed to create Stripe PaymentIntent",
      );
      throw new AppError(502, "Payment provider error");
    }

    if (!paymentIntent.client_secret) {
      logger.error(
        { bookingId: booking.id, paymentIntentId: paymentIntent.id },
        "Stripe PaymentIntent returned without client_secret",
      );
      throw new AppError(502, "Failed to create payment intent");
    }

    await prisma.payment.upsert({
      where: { bookingId: booking.id },
      create: {
        bookingId: booking.id,
        amount: booking.totalPrice,
        currency: "USD",
        provider: "STRIPE",
        status: "PENDING",
        transactionId: paymentIntent.id,
      },
      update: {
        amount: booking.totalPrice,
        currency: "USD",
        provider: "STRIPE",
        status: "PENDING",
        transactionId: paymentIntent.id,
      },
    });

    return { clientSecret: paymentIntent.client_secret };
  }

  // TODO:   enforce PENDING booking status guard.
  // TODO:   replace legacy create with PaymentIntent-first flow.
  // TODO:   persist provider intent id for webhook reconciliation.
  /**
   * Legacy fallback flow for direct payment record creation.
   */
  static async create(data: CreatePaymentInput, userId: string) {
    if (data.provider !== "STRIPE") {
      throw new AppError(400, `Unsupported payment provider: ${data.provider}`);
    }

    const booking = await prisma.booking.findUnique({
      where: { id: data.bookingId },
      include: { payment: true },
    });

    if (!booking) {
      throw new AppError(404, "Booking not found");
    }

    if (booking.userId !== userId) {
      throw new AppError(403, "Not authorized");
    }

    if (booking.payment) {
      throw new AppError(409, "Payment already exists for this booking");
    }

    return prisma.payment.create({
      data: {
        bookingId: data.bookingId,
        amount: booking.totalPrice,
        currency: data.currency || "USD",
        provider: data.provider,
        status: "PENDING",
      },
    });
  }

  /**
   * Read path for payment details scoped to booking owner.
   */
  static async getById(id: string, userId: string) {
    const payment = await prisma.payment.findUnique({
      where: { id },
      include: {
        booking: {
          include: {
            property: true,
          },
        },
      },
    });

    if (!payment) {
      throw new AppError(404, "Payment not found");
    }

    if (payment.booking.userId !== userId) {
      throw new AppError(403, "Not authorized");
    }

    const { metadata: _metadata, ...paymentWithoutMetadata } = payment;
    return paymentWithoutMetadata;
  }

  // TODO:   verify provider state before marking SUCCESS.
  /**
   * Manual override path; intended only for test/ops intervention.
   */
  static async process(id: string, userId: string, userRole: string) {
    if (userRole !== "ADMIN") {
      throw new AppError(403, "Not authorized");
    }

    const payment = await prisma.payment.findUnique({
      where: { id },
      select: { id: true, status: true, bookingId: true, amount: true, currency: true },
    });

    if (!payment) {
      throw new AppError(404, "Payment not found");
    }

    if (payment.status !== "PENDING") {
      throw new AppError(400, "Payment already processed");
    }

    // Bypasses provider-state checks; isolate from normal prod flow.
    logger.warn({ paymentId: id, userId }, "Manual payment process override used");

    const updatedPayment = await prisma.$transaction(async (tx) => {
      const p = await tx.payment.update({
        where: { id },
        data: { status: "SUCCESS" },
      });

      await tx.booking.update({
        where: { id: payment.bookingId },
        data: { status: "CONFIRMED" },
      });

      return p;
    });

    const booking = await prisma.booking.findUnique({
      where: { id: payment.bookingId },
      include: {
        user: { select: { email: true, firstName: true, lastName: true } },
        property: {
          select: {
            title: true,
            owner: { select: { email: true, firstName: true } },
          },
        },
      },
    });

    if (booking) {
      const amountPaid = Number(payment.amount);

      await emailQueue.add("payment-success-guest", {
        paymentId: id,
        bookingId: booking.id,
        guestEmail: booking.user.email,
        guestFirstName: booking.user.firstName,
        propertyTitle: booking.property.title,
        checkIn: formatDate(booking.checkIn),
        checkOut: formatDate(booking.checkOut),
        amountPaid,
        currency: payment.currency,
      });

      await emailQueue.add("payment-success-host", {
        paymentId: id,
        bookingId: booking.id,
        hostEmail: booking.property.owner.email,
        hostFirstName: booking.property.owner.firstName,
        propertyTitle: booking.property.title,
        guestFirstName: booking.user.firstName,
        guestLastName: booking.user.lastName,
        checkIn: formatDate(booking.checkIn),
        checkOut: formatDate(booking.checkOut),
        amountPaid,
        currency: payment.currency,
      });
    }

    return updatedPayment;
  }
}
