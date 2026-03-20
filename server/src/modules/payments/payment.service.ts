import { prisma } from "../../shared/lib/prisma.js";
import { Prisma } from "@prisma/client";
import { AppError } from "../../shared/middlewares/error.handler.js";
import { logger } from "../../shared/lib/logger.js";
import { stripe } from "../../shared/lib/stripe.js";
import { env } from "../../config/env.js";
import { emailQueue } from "../../shared/queues/email.queue.js";
import type {
  CreatePaymentInput,
  CreatePaymentIntentInput,
} from "./payment.types.js";

/**
 * Handles payment processing and refund lifecycle operations.
 *
 * Critical requirements:
 * 1. Use Stripe (or PayPal) for payment processing.
 * 2. Handle webhook events for asynchronous payment confirmation.
 * 3. Enforce idempotency to prevent duplicate processing.
 * 4. Update booking status to CONFIRMED only after successful payment.
 * 5. Validate refund requests before processing.
 * 6. Store transaction identifiers for reconciliation.
 * 7. Handle payment failures predictably.
 * 8. Maintain PCI compliance by never storing card details.
 */
export class PaymentService {
  private static formatDate(date: Date) {
    return new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
      timeZone: "UTC",
    }).format(date);
  }

  private static getMetadataObject(metadata: Prisma.JsonValue | null) {
    if (metadata && typeof metadata === "object" && !Array.isArray(metadata)) {
      return metadata as Prisma.JsonObject;
    }

    return {} as Prisma.JsonObject;
  }

  private static calculateRefundPolicy(checkIn: Date) {
    const msUntilCheckIn = checkIn.getTime() - Date.now();
    const hoursUntilCheckIn = msUntilCheckIn / (1000 * 60 * 60);
    const daysUntilCheckIn = Math.max(0, Math.ceil(hoursUntilCheckIn / 24));

    let refundPercent = 0;
    if (hoursUntilCheckIn > 48) {
      refundPercent = 100;
    } else if (hoursUntilCheckIn >= 24) {
      refundPercent = 50;
    }

    return {
      msUntilCheckIn,
      hoursUntilCheckIn,
      daysUntilCheckIn,
      refundPercent,
    };
  }

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

  static async create(data: CreatePaymentInput, userId: string) {
    // TODO: Enforce PENDING booking status before payment creation.
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

    // TODO: Replace temporary record creation with Stripe PaymentIntent flow.
    // TODO: Persist provider intent identifier for webhook reconciliation.
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

    return payment;
  }

  static async process(id: string, userId: string) {
    const payment = await this.getById(id, userId);

    if (payment.status !== "PENDING") {
      throw new AppError(400, "Payment already processed");
    }

    // WARNING: This endpoint is intended for testing/manual intervention.
    // Production payment finalization must be handled by verified webhooks.
    // TODO: Verify provider payment state before marking payment as SUCCESS.
    // TODO: Update payment and booking state atomically in one transaction.
    // TODO: Enqueue booking confirmation notification after successful processing.

    return prisma.payment.update({
      where: { id },
      data: {
        status: "SUCCESS",
      },
    });
  }

  static async requestRefund(id: string, userId: string, reason?: string) {
    const payment = await prisma.payment.findUnique({
      where: { id },
      include: {
        booking: {
          include: {
            user: {
              select: {
                firstName: true,
                lastName: true,
                email: true,
              },
            },
            property: {
              select: {
                title: true,
              },
            },
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

    if (payment.status === "REFUND_REQUESTED") {
      return payment;
    }

    if (payment.status !== "SUCCESS") {
      throw new AppError(
        400,
        "Refund request can only be created for successful payments",
      );
    }

    if (payment.booking.status === "COMPLETED") {
      throw new AppError(400, "Cannot request refund for completed booking");
    }

    const policy = this.calculateRefundPolicy(payment.booking.checkIn);
    if (policy.msUntilCheckIn <= 0) {
      throw new AppError(400, "Cannot request refund after check-in date");
    }

    if (policy.refundPercent === 0) {
      throw new AppError(
        400,
        "Refund request is not allowed less than 24 hours before check-in",
      );
    }

    const existingMetadata = this.getMetadataObject(payment.metadata);
    const refundAmount =
      (Number(payment.amount) * Number(policy.refundPercent)) / 100;

    const updatedPayment = await prisma.payment.update({
      where: { id },
      data: {
        status: "REFUND_REQUESTED",
        metadata: {
          ...existingMetadata,
          refundRequest: {
            requestedAt: new Date().toISOString(),
            requestedBy: userId,
            refundPercent: policy.refundPercent,
            refundAmount,
            daysUntilCheckIn: policy.daysUntilCheckIn,
            reason: reason ?? null,
          },
        },
      },
    });

    const admins = await prisma.user.findMany({
      where: { role: "ADMIN" },
      select: { email: true, firstName: true },
    });

    await Promise.all(
      admins.map((admin) =>
        emailQueue.add("refund-requested-admin", {
          adminEmail: admin.email,
          adminFirstName: admin.firstName,
          paymentId: updatedPayment.id,
          bookingId: updatedPayment.bookingId,
          guestFullName: `${payment.booking.user.firstName} ${payment.booking.user.lastName}`,
          guestEmail: payment.booking.user.email,
          propertyTitle: payment.booking.property.title,
          checkIn: this.formatDate(payment.booking.checkIn),
          checkOut: this.formatDate(payment.booking.checkOut),
          refundPercent: policy.refundPercent,
          refundAmount,
          reason: reason ?? null,
        }),
      ),
    );

    return updatedPayment;
  }

  static async approveRefund(id: string, adminId: string) {
    const payment = await prisma.payment.findUnique({
      where: { id },
      include: {
        booking: {
          include: {
            user: {
              select: {
                email: true,
                firstName: true,
              },
            },
            property: {
              select: {
                title: true,
              },
            },
          },
        },
      },
    });

    if (!payment) {
      throw new AppError(404, "Payment not found");
    }

    if (payment.status !== "REFUND_REQUESTED") {
      throw new AppError(400, "Payment is not waiting for refund approval");
    }

    if (!payment.transactionId) {
      throw new AppError(400, "Missing payment transaction id");
    }

    let stripeRefund;
    try {
      stripeRefund = await stripe.refunds.create(
        {
          payment_intent: payment.transactionId,
          metadata: {
            paymentId: payment.id,
            bookingId: payment.bookingId,
            approvedBy: adminId,
          },
        },
        {
          idempotencyKey: `refund_${payment.id}`,
        },
      );
    } catch (error) {
      logger.error(
        { error, paymentId: payment.id, bookingId: payment.bookingId },
        "Failed to create Stripe refund",
      );
      throw new AppError(502, "Payment provider error during refund");
    }

    const existingMetadata = this.getMetadataObject(payment.metadata);

    const updatedPayment = await prisma.$transaction(async (tx) => {
      const updatedPayment = await tx.payment.update({
        where: { id },
        data: {
          status: "REFUNDED",
          metadata: {
            ...existingMetadata,
            refundApproval: {
              approvedAt: new Date().toISOString(),
              approvedBy: adminId,
              stripeRefundId: stripeRefund.id,
            },
          },
        },
      });

      if (payment.booking.status !== "CANCELLED") {
        await tx.booking.update({
          where: { id: payment.bookingId },
          data: { status: "CANCELLED" },
        });
      }

      return updatedPayment;
    });

    await emailQueue.add("refund-processed-guest", {
      paymentId: updatedPayment.id,
      bookingId: updatedPayment.bookingId,
      guestEmail: payment.booking.user.email,
      guestFirstName: payment.booking.user.firstName,
      propertyTitle: payment.booking.property.title,
      isApproved: true,
      reason: null,
    });

    return updatedPayment;
  }

  static async rejectRefund(id: string, adminId: string, reason?: string) {
    const payment = await prisma.payment.findUnique({
      where: { id },
      include: {
        booking: {
          include: {
            user: {
              select: {
                email: true,
                firstName: true,
              },
            },
            property: {
              select: {
                title: true,
              },
            },
          },
        },
      },
    });

    if (!payment) {
      throw new AppError(404, "Payment not found");
    }

    if (payment.status !== "REFUND_REQUESTED") {
      throw new AppError(400, "Payment is not waiting for refund approval");
    }

    const existingMetadata = this.getMetadataObject(payment.metadata);

    const updatedPayment = await prisma.payment.update({
      where: { id },
      data: {
        status: "SUCCESS",
        metadata: {
          ...existingMetadata,
          refundRejection: {
            rejectedAt: new Date().toISOString(),
            rejectedBy: adminId,
            reason: reason ?? null,
          },
        },
      },
    });

    await emailQueue.add("refund-processed-guest", {
      paymentId: updatedPayment.id,
      bookingId: updatedPayment.bookingId,
      guestEmail: payment.booking.user.email,
      guestFirstName: payment.booking.user.firstName,
      propertyTitle: payment.booking.property.title,
      isApproved: false,
      reason: reason ?? null,
    });

    return updatedPayment;
  }

  /**
   * Handle Stripe webhook events
   * CRITICAL: This is the PRIMARY way payment status should be updated
   */
  static async handleStripeWebhook(
    event: any, // Stripe.Event type
    signature: string,
  ) {
    let stripeEvent;
    try {
      stripeEvent = stripe.webhooks.constructEvent(
        event,
        signature,
        env.STRIPE_WEBHOOK_SECRET,
      );
    } catch (error) {
      logger.error({ error }, "Webhook signature verification failed");
      throw new AppError(400, "Invalid webhook signature");
    }

    try {
      await prisma.processedStripeEvent.create({
        data: {
          eventId: stripeEvent.id,
          eventType: stripeEvent.type,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        logger.info(
          { stripeEventId: stripeEvent.id, eventType: stripeEvent.type },
          "Duplicate Stripe webhook event skipped",
        );
        return { success: true };
      }

      logger.error(
        { error, stripeEventId: stripeEvent.id, eventType: stripeEvent.type },
        "Failed to register Stripe webhook event",
      );
      throw new AppError(500, "Failed to process webhook");
    }

    try {
      switch (stripeEvent.type) {
        case "payment_intent.succeeded":
          await this.handlePaymentSuccess(stripeEvent.data.object);
          break;
        case "payment_intent.payment_failed":
          await this.handlePaymentFailed(stripeEvent.data.object);
          break;
        case "charge.refunded":
          await this.handleChargeRefunded(stripeEvent.data.object);
          break;
        default:
          logger.info(
            { eventType: stripeEvent.type },
            "Unhandled webhook event",
          );
      }
    } catch (error) {
      await prisma.processedStripeEvent.deleteMany({
        where: { eventId: stripeEvent.id },
      });

      throw error;
    }

    return { success: true };
  }

  /**
   * Handle successful payment (webhook event)
   */
  private static async handlePaymentSuccess(paymentIntent: any) {
    const bookingId = paymentIntent?.metadata?.bookingId as string | undefined;
    if (!bookingId) {
      logger.error(
        { paymentIntentId: paymentIntent?.id },
        "Missing bookingId in payment intent metadata",
      );
      return;
    }

    const amount = Number(
      paymentIntent.amount_received ?? paymentIntent.amount,
    );
    const amountInMainCurrency = Number.isFinite(amount) ? amount / 100 : 0;

    let updatedPaymentId: string | null = null;

    await prisma.$transaction(async (tx) => {
      const upsertedPayment = await tx.payment.upsert({
        where: { bookingId },
        create: {
          bookingId,
          amount: amountInMainCurrency,
          currency: String(paymentIntent.currency ?? "usd").toUpperCase(),
          provider: "STRIPE",
          status: "SUCCESS",
          transactionId: paymentIntent.id,
          metadata: paymentIntent,
        },
        update: {
          status: "SUCCESS",
          transactionId: paymentIntent.id,
          metadata: paymentIntent,
        },
      });

      updatedPaymentId = upsertedPayment.id;

      await tx.booking.update({
        where: { id: bookingId },
        data: { status: "CONFIRMED" },
      });
    });

    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        user: {
          select: {
            email: true,
            firstName: true,
          },
        },
        property: {
          select: {
            title: true,
          },
        },
      },
    });

    if (booking && updatedPaymentId) {
      await emailQueue.add("payment-success-guest", {
        paymentId: updatedPaymentId,
        bookingId: booking.id,
        guestEmail: booking.user.email,
        guestFirstName: booking.user.firstName,
        propertyTitle: booking.property.title,
        checkIn: this.formatDate(booking.checkIn),
        checkOut: this.formatDate(booking.checkOut),
        amountPaid: amountInMainCurrency,
        currency: String(paymentIntent.currency ?? "usd").toUpperCase(),
      });
    }

    logger.info(
      { bookingId, paymentIntentId: paymentIntent.id },
      "Payment succeeded",
    );
  }

  /**
   * Handle failed payment (webhook event)
   */
  private static async handlePaymentFailed(paymentIntent: any) {
    const bookingId = paymentIntent?.metadata?.bookingId as string | undefined;
    if (!bookingId) {
      logger.warn(
        { paymentIntentId: paymentIntent?.id },
        "Missing bookingId in failed payment intent metadata",
      );
      return;
    }

    await prisma.payment.updateMany({
      where: { bookingId },
      data: {
        status: "FAILED",
        transactionId: paymentIntent.id,
        metadata: paymentIntent,
      },
    });

    logger.warn(
      { bookingId, paymentIntentId: paymentIntent.id },
      "Payment failed",
    );
  }

  /**
   * Handle refunds initiated directly in Stripe Dashboard.
   */
  private static async handleChargeRefunded(charge: any) {
    const paymentIntentRaw = charge?.payment_intent;
    const paymentIntentId =
      typeof paymentIntentRaw === "string"
        ? paymentIntentRaw
        : paymentIntentRaw?.id;

    if (!paymentIntentId) {
      logger.warn(
        { chargeId: charge?.id },
        "Missing payment_intent in charge.refunded webhook",
      );
      return;
    }

    const payment = await prisma.payment.findFirst({
      where: { transactionId: paymentIntentId },
      include: { booking: true },
    });

    if (!payment) {
      logger.warn(
        { paymentIntentId, chargeId: charge?.id },
        "Payment not found for charge.refunded webhook",
      );
      return;
    }

    const existingMetadata = this.getMetadataObject(payment.metadata);

    await prisma.$transaction(async (tx) => {
      await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: "REFUNDED",
          metadata: {
            ...existingMetadata,
            refundFromStripeDashboard: {
              receivedAt: new Date().toISOString(),
              chargeId: charge?.id ?? null,
              paymentIntentId,
              amountRefunded: charge?.amount_refunded ?? null,
            },
          },
        },
      });

      if (payment.booking.status !== "CANCELLED") {
        await tx.booking.update({
          where: { id: payment.bookingId },
          data: { status: "CANCELLED" },
        });
      }
    });

    logger.info(
      { paymentId: payment.id, bookingId: payment.bookingId, paymentIntentId },
      "Refund synchronized from charge.refunded webhook",
    );
  }
}
