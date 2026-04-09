import { prisma } from "../../shared/lib/prisma.js";
import { AppError } from "../../shared/middlewares/error.handler.js";
import { logger } from "../../shared/lib/logger.js";
import { stripe } from "../../shared/lib/stripe.js";
import { env } from "../../config/env.js";
import type {
  CreatePaymentInput,
  CreatePaymentIntentInput,
} from "./payment.types.js";

export class PaymentIntentService {
  /** Stripe intent flow: validate booking ownership/state, then upsert pending payment stub. */
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
          metadata: {
            bookingId: booking.id,
            userId,
          },
        },
        {
          idempotencyKey: `intent_${booking.id}`,
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

  /** Legacy fallback flow for direct payment record creation. */
  static async create(data: CreatePaymentInput, userId: string) {
    // TODO: enforce PENDING booking status guard.
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

    // TODO: replace legacy create with PaymentIntent-first flow.
    // TODO: persist provider intent id for webhook reconciliation.
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

  /** Read path for payment details scoped to booking owner. */
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

  /** Manual override path; intended only for test/ops intervention. */
  static async process(id: string, userId: string, userRole: string) {
    if (userRole !== "ADMIN") {
      throw new AppError(403, "Not authorized");
    }

    const payment = await prisma.payment.findUnique({
      where: { id },
      select: { id: true, status: true },
    });

    if (!payment) {
      throw new AppError(404, "Payment not found");
    }

    if (payment.status !== "PENDING") {
      throw new AppError(400, "Payment already processed");
    }

    // Bypasses provider-state checks; keep this path out of normal prod flow.
    logger.warn({ paymentId: id, userId }, "Manual payment process override used");
    // TODO: verify provider state before marking SUCCESS.
    // TODO: update payment+booking atomically.
    // TODO: enqueue booking-confirmation notification.

    return prisma.payment.update({
      where: { id },
      data: {
        status: "SUCCESS",
      },
    });
  }
}
