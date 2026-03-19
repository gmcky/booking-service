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
 * PaymentService - Handles payment processing and refunds
 *
 * CRITICAL REQUIREMENTS:
 * 1. Use Stripe (or PayPal) for payment processing
 * 2. Handle webhook events for async payment confirmation
 * 3. Implement idempotency to prevent duplicate charges
 * 4. Update Booking status to CONFIRMED only after successful payment
 * 5. Handle refunds with proper validation
 * 6. Store transaction IDs for reconciliation
 * 7. Handle payment failures gracefully
 * 8. Implement PCI compliance (never store card details)
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
    // TODO: SECURITY - Verify booking belongs to user
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

    // TODO: Check booking status - only PENDING bookings need payment
    // if (booking.status !== 'PENDING') {
    //   throw new AppError(400, 'Booking not in pending status');
    // }

    if (booking.payment) {
      throw new AppError(409, "Payment already exists for this booking");
    }

    // TODO: Create Stripe Payment Intent (server-side)
    // Payment Intent is Stripe's recommended way to handle payments
    // It supports 3D Secure, retries, and various payment methods
    //
    // const paymentIntent = await stripe.paymentIntents.create({
    //   amount: Math.round(booking.totalPrice * 100), // Convert to cents
    //   currency: data.currency || 'usd',
    //   customer: await getOrCreateStripeCustomer(userId), // Reuse customer
    //   metadata: {
    //     bookingId: data.bookingId,
    //     userId,
    //     propertyId: booking.propertyId
    //   },
    //   description: `Booking for property ${booking.propertyId}`,
    //   // CRITICAL: Store idempotency key to prevent duplicate charges
    //   idempotencyKey: `booking_${data.bookingId}_${Date.now()}`
    // });
    //
    // // Return client_secret to frontend for payment confirmation
    // // Frontend uses Stripe.js to securely collect card details
    // return {
    //   clientSecret: paymentIntent.client_secret,
    //   paymentIntentId: paymentIntent.id
    // };

    // TEMPORARY: Create payment record (replace with Stripe integration)
    return prisma.payment.create({
      data: {
        bookingId: data.bookingId,
        amount: booking.totalPrice,
        currency: data.currency || "USD",
        provider: data.provider,
        status: "PENDING",
      },
    });

    // TODO: Store payment intent ID for webhook processing
    // When webhook arrives, we'll match it using this ID
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

    // ⚠️ WARNING: This should NOT be called directly by users!
    // Payment processing should happen via Stripe webhook
    // This method exists only for testing or manual intervention

    // TODO: Verify payment with Stripe before updating status
    // const paymentIntent = await stripe.paymentIntents.retrieve(payment.transactionId);
    // if (paymentIntent.status !== 'succeeded') {
    //   throw new AppError(400, 'Payment not confirmed by Stripe');
    // }

    // TODO: Use transaction to update payment + booking status atomically
    // This ensures consistency - either both succeed or both fail
    //
    // return await prisma.$transaction(async (tx) => {
    //   // Step 1: Update payment status
    //   const updatedPayment = await tx.payment.update({
    //     where: { id },
    //     data: {
    //       status: 'SUCCESS',
    //       processedAt: new Date(),
    //       // Store Stripe transaction details
    //       transactionId: paymentIntent.id,
    //       metadata: JSON.stringify(paymentIntent)
    //     }
    //   });
    //
    //   // Step 2: Update booking status to CONFIRMED
    //   await tx.booking.update({
    //     where: { id: payment.bookingId },
    //     data: { status: 'CONFIRMED' }
    //   });
    //
    //   return updatedPayment;
    // });

    return prisma.payment.update({
      where: { id },
      data: {
        status: "SUCCESS",
        // transactionId: result.transactionId,
        // metadata: result.metadata,
      },
    });

    // TODO: Trigger background job for confirmation email
    // await emailQueue.add('payment-success', {
    //   bookingId: payment.bookingId,
    //   amount: payment.amount
    // });

    // TODO: Log successful payment
    // logger.info({
    //   event: 'payment_success',
    //   paymentId: id,
    //   bookingId: payment.bookingId,
    //   amount: payment.amount
    // }, 'Payment processed successfully');
  }

  static async refund(id: string, userId: string) {
    const payment = await this.getById(id, userId);

    if (payment.status !== "SUCCESS") {
      throw new AppError(400, "Can only refund successful payments");
    }

    // TODO: Check if already refunded (idempotency)
    // if (payment.status === 'REFUNDED') {
    //   return payment; // Already refunded, return success (idempotent)
    // }

    // TODO: Validate refund eligibility based on booking status
    // const booking = await prisma.booking.findUnique({
    //   where: { id: payment.bookingId }
    // });
    // if (booking.status === 'COMPLETED') {
    //   throw new AppError(400, 'Cannot refund completed bookings');
    // }

    // TODO: Process refund with Stripe
    // const refund = await stripe.refunds.create({
    //   payment_intent: payment.transactionId,
    //   amount: Math.round(payment.amount * 100), // Full refund
    //   reason: 'requested_by_customer',
    //   metadata: {
    //     bookingId: payment.bookingId,
    //     userId
    //   }
    // });
    //
    // if (refund.status !== 'succeeded') {
    //   throw new AppError(500, 'Refund failed');
    // }

    // TODO: Use transaction to update payment + booking atomically
    // return await prisma.$transaction([
    //   prisma.payment.update({
    //     where: { id },
    //     data: {
    //       status: 'REFUNDED',
    //       refundedAt: new Date(),
    //       refundTransactionId: refund.id
    //     }
    //   }),
    //   prisma.booking.update({
    //     where: { id: payment.bookingId },
    //     data: { status: 'CANCELLED' }
    //   })
    // ]);

    return prisma.payment.update({
      where: { id },
      data: { status: "REFUNDED" },
    });

    // TODO: Trigger background job for refund confirmation email
    // await emailQueue.add('refund-processed', {
    //   bookingId: payment.bookingId,
    //   amount: payment.amount
    // });

    // TODO: Log refund
    // logger.info({ paymentId: id, bookingId: payment.bookingId }, 'Refund processed');
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
