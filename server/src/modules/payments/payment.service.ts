import { prisma } from "../../shared/lib/prisma.js";
import { AppError } from "../../shared/middlewares/error.handler.js";
import { logger } from "../../shared/lib/logger.js";
import type { CreatePaymentInput } from "./payment.types.js";
// import Stripe from 'stripe';
// import { env } from '../../config/env.js';

// TODO: Initialize Stripe client
// const stripe = new Stripe(env.STRIPE_SECRET_KEY, {
//   apiVersion: '2024-12-18.acacia', // Use latest API version
//   typescript: true
// });

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
    // TODO: Implement Stripe webhook handler
    //
    // CRITICAL SECURITY: Verify webhook signature
    // This prevents malicious actors from faking payment success
    //
    // let stripeEvent: Stripe.Event;
    // try {
    //   stripeEvent = stripe.webhooks.constructEvent(
    //     event, // Raw body (string or buffer)
    //     signature,
    //     env.STRIPE_WEBHOOK_SECRET
    //   );
    // } catch (err) {
    //   logger.error({ error: err.message }, 'Webhook signature verification failed');
    //   throw new AppError(400, 'Invalid webhook signature');
    // }
    //
    // // IDEMPOTENCY: Check if event already processed
    // // Stripe may send duplicate events (network retries)
    // const existingEvent = await prisma.webhookEvent.findUnique({
    //   where: { eventId: stripeEvent.id }
    // });
    // if (existingEvent) {
    //   logger.warn({ eventId: stripeEvent.id }, 'Duplicate webhook event ignored');
    //   return { success: true, message: 'Already processed' };
    // }
    //
    // // Handle different event types
    // switch (stripeEvent.type) {
    //   case 'payment_intent.succeeded':
    //     await this.handlePaymentSuccess(stripeEvent.data.object);
    //     break;
    //
    //   case 'payment_intent.payment_failed':
    //     await this.handlePaymentFailed(stripeEvent.data.object);
    //     break;
    //
    //   case 'charge.refunded':
    //     await this.handleRefundCompleted(stripeEvent.data.object);
    //     break;
    //
    //   default:
    //     logger.info({ eventType: stripeEvent.type }, 'Unhandled webhook event');
    // }
    //
    // // Mark event as processed (prevent duplicate processing)
    // await prisma.webhookEvent.create({
    //   data: {
    //     eventId: stripeEvent.id,
    //     type: stripeEvent.type,
    //     processedAt: new Date()
    //   }
    // });
    //
    // return { success: true };

    throw new AppError(501, "Not implemented");
  }

  /**
   * Handle successful payment (webhook event)
   */
  private static async handlePaymentSuccess(paymentIntent: any) {
    // TODO: Extract booking ID from metadata
    // const bookingId = paymentIntent.metadata.bookingId;
    // if (!bookingId) {
    //   logger.error({ paymentIntentId: paymentIntent.id }, 'Missing bookingId in metadata');
    //   return;
    // }
    //
    // // Update payment and booking in transaction (atomic!)
    // await prisma.$transaction(async (tx) => {
    //   // Find or create payment record
    //   const payment = await tx.payment.findFirst({
    //     where: { bookingId }
    //   });
    //
    //   if (payment) {
    //     await tx.payment.update({
    //       where: { id: payment.id },
    //       data: {
    //         status: 'SUCCESS',
    //         transactionId: paymentIntent.id,
    //         processedAt: new Date(),
    //         metadata: JSON.stringify(paymentIntent)
    //       }
    //     });
    //   }
    //
    //   // ✅ CRITICAL: Update booking status to CONFIRMED
    //   // Only confirmed bookings show in host's calendar
    //   await tx.booking.update({
    //     where: { id: bookingId },
    //     data: { status: 'CONFIRMED' }
    //   });
    // });
    //
    // // Send confirmation emails (async)
    // await emailQueue.add('booking-confirmed', { bookingId });
    //
    // logger.info({ bookingId, paymentIntentId: paymentIntent.id }, 'Payment succeeded');
  }

  /**
   * Handle failed payment (webhook event)
   */
  private static async handlePaymentFailed(paymentIntent: any) {
    // TODO: Update payment status to FAILED
    // TODO: Notify user about payment failure
    // TODO: Cancel booking (or allow retry?)
    // TODO: Log for monitoring
  }
}
