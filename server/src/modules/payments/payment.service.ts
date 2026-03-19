import { prisma } from "../../shared/lib/prisma.js";
import { Prisma } from "@prisma/client";
import { AppError } from "../../shared/middlewares/error.handler.js";
import { logger } from "../../shared/lib/logger.js";
import { stripe } from "../../shared/lib/stripe.js";
import { env } from "../../config/env.js";
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

  static async refund(id: string, userId: string) {
    const payment = await this.getById(id, userId);

    if (payment.status !== "SUCCESS") {
      throw new AppError(400, "Can only refund successful payments");
    }

    // TODO: Make refunds idempotent for repeated requests.
    // TODO: Validate refund eligibility against booking lifecycle state.
    // TODO: Execute provider refund before local status transition.
    // TODO: Update payment and booking state atomically.
    // TODO: Enqueue refund confirmation notification after completion.

    return prisma.payment.update({
      where: { id },
      data: { status: "REFUNDED" },
    });
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

    await prisma.$transaction(async (tx) => {
      await tx.payment.upsert({
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

      await tx.booking.update({
        where: { id: bookingId },
        data: { status: "CONFIRMED" },
      });
    });

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
}
