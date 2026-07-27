import { prisma } from "../../shared/lib/prisma.js";
import { Prisma } from "@prisma/client";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/client";
import { AppError } from "../../shared/middlewares/error.handler.js";
import { logger } from "../../shared/lib/logger.js";
import { stripe } from "../../shared/lib/stripe.js";
import { env } from "../../config/env.js";
import { emailQueue } from "../../shared/queues/email.queue.js";
import { sendOpsAlert } from "../../shared/lib/ops-alert.js";
import { cacheInvalidateNamespace } from "../../shared/lib/cache.js";
import { setTimeout as sleep } from "timers/promises";
import type Stripe from "stripe";
import {
  formatDate,
  getAuditObject,
  getMetadataObject,
  getStripePayloadObject,
  toFiniteNumber,
  toInputJsonObject,
} from "./payment.helpers.js";

export class PaymentWebhookService {
  /**
   * Verify webhook signature, deduplicate events, and dispatch handlers.
   */
  static async handleStripeWebhook(event: string | Buffer, signature: string) {
    let stripeEvent: Stripe.Event;
    try {
      stripeEvent = stripe.webhooks.constructEvent(event, signature, env.STRIPE_WEBHOOK_SECRET);
    } catch (error) {
      logger.error({ error }, "Webhook signature verification failed");
      throw new AppError(400, "Invalid webhook signature");
    }

    const alreadyProcessed = await prisma.processedStripeEvent.findUnique({
      where: { eventId: stripeEvent.id },
    });
    if (alreadyProcessed) {
      logger.info(
        { stripeEventId: stripeEvent.id, eventType: stripeEvent.type },
        "Duplicate Stripe webhook event skipped",
      );
      return { success: true };
    }

    // Handlers run before dedup record. App crash mid-handler = safe retry.
    // Handlers must be idempotent; email jobs use jobId for deduplication.
    switch (stripeEvent.type) {
      case "payment_intent.amount_capturable_updated":
        await this.handlePaymentAuthorized(
          stripeEvent.data.object as Stripe.PaymentIntent,
          stripeEvent.id,
        );
        break;
      case "payment_intent.succeeded":
        await this.handlePaymentSuccess(
          stripeEvent.data.object as Stripe.PaymentIntent,
          stripeEvent.id,
        );
        break;
      case "payment_intent.payment_failed":
        await this.handlePaymentFailed(stripeEvent.data.object as Stripe.PaymentIntent);
        break;
      case "charge.refunded":
        await this.handleChargeRefunded(stripeEvent.data.object as Stripe.Charge, stripeEvent.id);
        break;
      default:
        logger.info({ eventType: stripeEvent.type }, "Unhandled webhook event");
    }

    try {
      await prisma.processedStripeEvent.create({
        data: {
          eventId: stripeEvent.id,
          eventType: stripeEvent.type,
        },
      });
    } catch (error) {
      if (error instanceof PrismaClientKnownRequestError && error.code === "P2002") {
        // Concurrent delivery race condition. Idempotent handler ran, safe to ignore.
        return { success: true };
      }

      logger.error(
        { error, stripeEventId: stripeEvent.id, eventType: stripeEvent.type },
        "Failed to record processed Stripe event — handler succeeded but dedup record missing",
      );
    }

    return { success: true };
  }

  /**
   * Card authorized (manual capture): resolve the confirm race. The first
   * booking to authorize for a date range wins — it is confirmed and its
   * intent captured. A loser's authorization is voided (no charge, no
   * processing fee) and the booking released. Serializable tx + retry
   * mirrors BookingService.create, so two racing authorizations cannot
   * both confirm: SSI aborts one, and its retry sees the winner.
   */
  private static async handlePaymentAuthorized(
    paymentIntent: Stripe.PaymentIntent,
    eventId: string,
  ) {
    const bookingId = paymentIntent?.metadata?.bookingId as string | undefined;
    if (!bookingId) {
      logger.error(
        { paymentIntentId: paymentIntent?.id },
        "Missing bookingId in authorized payment intent metadata",
      );
      return;
    }

    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      select: {
        id: true,
        propertyId: true,
        checkIn: true,
        checkOut: true,
        totalPrice: true,
        user: { select: { email: true, firstName: true } },
        property: { select: { title: true } },
      },
    });

    if (!booking) {
      logger.warn(
        { bookingId, paymentIntentId: paymentIntent.id },
        "Authorized intent for unknown booking — voiding",
      );
      await this.voidAuthorization(paymentIntent.id, bookingId);
      return;
    }

    // Authorization must match the booking's current price. A stale intent
    // (booking rescheduled/repriced after intent creation) is voided; the
    // booking stays PENDING so the guest can retry at the right amount.
    const expectedAmount = Math.round(Number(booking.totalPrice) * 100);
    if (paymentIntent.amount !== expectedAmount) {
      logger.warn(
        {
          bookingId,
          paymentIntentId: paymentIntent.id,
          authorizedAmount: paymentIntent.amount,
          expectedAmount,
        },
        "Authorized amount does not match booking price — voiding stale authorization",
      );
      await this.voidAuthorization(paymentIntent.id, booking.id);
      await prisma.payment.updateMany({
        where: { bookingId: booking.id, status: "PENDING" },
        data: { status: "FAILED" },
      });
      return;
    }

    const runRaceTx = () =>
      prisma.$transaction(
        async (tx) => {
          const conflict = await tx.booking.count({
            where: {
              propertyId: booking.propertyId,
              status: "CONFIRMED",
              checkIn: { lt: booking.checkOut },
              checkOut: { gt: booking.checkIn },
              id: { not: booking.id },
            },
          });
          if (conflict > 0) return "LOST" as const;

          const confirmed = await tx.booking.updateMany({
            where: { id: booking.id, status: "PENDING" },
            data: { status: "CONFIRMED" },
          });
          if (confirmed.count === 1) return "WON" as const;

          // Redelivered event for an already-confirmed booking is a win;
          // a cancelled/expired booking is gone.
          const current = await tx.booking.findUnique({
            where: { id: booking.id },
            select: { status: true },
          });
          return current?.status === "CONFIRMED" ? ("WON" as const) : ("GONE" as const);
        },
        { isolationLevel: "Serializable" },
      );

    let outcome!: Awaited<ReturnType<typeof runRaceTx>>;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        outcome = await runRaceTx();
        break;
      } catch (err) {
        if (err instanceof PrismaClientKnownRequestError && err.code === "P2034" && attempt < 3) {
          await sleep(50 * attempt);
          continue;
        }
        throw err;
      }
    }

    if (outcome === "WON") {
      const captureError = await this.captureAuthorization(paymentIntent.id, bookingId);
      if (!captureError) {
        // Confirmation is the moment inventory locks now — search caches must
        // drop stale availability.
        await cacheInvalidateNamespace("properties:search");
        logger.info(
          { bookingId, paymentIntentId: paymentIntent.id },
          "Booking won confirm race — captured",
        );
        return;
      }

      {
        const error = captureError;
        // Booking is confirmed but no funds were captured — roll back and
        // release rather than hold inventory for free.
        logger.error(
          { error, bookingId, paymentIntentId: paymentIntent.id },
          "CRITICAL: capture failed after confirm — releasing booking",
        );
        void sendOpsAlert({
          title: "Capture failed after booking confirm",
          message:
            "Authorization could not be captured for a confirmed booking. Booking rolled back and released; verify the intent state in Stripe.",
          context: { bookingId, paymentIntentId: paymentIntent.id },
        });
        await prisma.booking.updateMany({
          where: { id: booking.id, status: "CONFIRMED" },
          data: { status: "CANCELLED", cancelledBy: "SYSTEM", payoutStatus: "CANCELLED" },
        });
        await prisma.payment.updateMany({
          where: { bookingId: booking.id, status: "PENDING" },
          data: { status: "FAILED" },
        });
        await this.voidAuthorization(paymentIntent.id, booking.id);
        return;
      }
    }

    // LOST or GONE: release the authorization, never charge.
    await this.voidAuthorization(paymentIntent.id, booking.id);
    await prisma.payment.updateMany({
      where: { bookingId: booking.id, status: "PENDING" },
      data: { status: "FAILED" },
    });

    if (outcome === "LOST") {
      await prisma.booking.updateMany({
        where: { id: booking.id, status: "PENDING" },
        data: { status: "CANCELLED", cancelledBy: "SYSTEM", payoutStatus: "CANCELLED" },
      });
      await emailQueue.add(
        "booking-dates-taken-guest",
        {
          bookingId: booking.id,
          guestEmail: booking.user.email,
          guestFirstName: booking.user.firstName,
          propertyTitle: booking.property.title,
          checkIn: formatDate(booking.checkIn),
          checkOut: formatDate(booking.checkOut),
        },
        { jobId: `dates-taken-${eventId}` },
      );
      logger.info(
        { bookingId, paymentIntentId: paymentIntent.id },
        "Booking lost confirm race — authorization voided, guest not charged",
      );
    } else {
      // GONE: guest cancelled or the expiry sweep released it while the
      // authorization was in flight; those paths already notified the guest.
      logger.info(
        { bookingId, paymentIntentId: paymentIntent.id },
        "Authorization arrived for a released booking — voided",
      );
    }
  }

  /**
   * Capture the authorization, and answer one question: is the money in?
   * Returns the error only when it definitively is not, because the caller
   * responds to that by cancelling a booking the guest believes they hold.
   *
   * Stripe delivers `amount_capturable_updated` more than once for the same
   * authorization — twice, a second apart, in the Cash App Pay flow that
   * exposed this. Two handlers then race the same capture: one wins, the
   * other's call comes back "already captured" or as an idempotency conflict
   * while the winner is still in flight. Treating either as a failed capture
   * cancelled a paid booking and refunded a guest who had done nothing wrong,
   * so the intent itself is consulted before believing the error, and a call
   * that lost to a concurrent one is retried once.
   */
  private static async captureAuthorization(
    paymentIntentId: string,
    bookingId: string,
  ): Promise<unknown | null> {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        await stripe.paymentIntents.capture(
          paymentIntentId,
          {},
          { idempotencyKey: `capture_${paymentIntentId}` },
        );
        return null;
      } catch (error) {
        if (await this.isCaptured(paymentIntentId)) {
          logger.info(
            { bookingId, paymentIntentId },
            "Capture call failed but the intent is captured — treating as won",
          );
          return null;
        }
        if (attempt === 2) return error;
        // The authorization is still live: most likely a duplicate delivery
        // captured it a moment ago and Stripe hasn't settled the state yet.
        logger.warn(
          { error, bookingId, paymentIntentId },
          "Capture failed with the authorization still open — retrying once",
        );
        await sleep(500);
      }
    }
    return null;
  }

  /**
   * Did the money actually move? Asked after a failed capture call, where the
   * error may only mean "someone else captured this a moment ago". Treated as
   * "not captured" if Stripe itself can't be reached: the rollback that
   * follows voids the authorization, which is the safe direction.
   */
  private static async isCaptured(paymentIntentId: string): Promise<boolean> {
    try {
      const intent = await stripe.paymentIntents.retrieve(paymentIntentId);
      return intent.status === "succeeded" || (intent.amount_received ?? 0) > 0;
    } catch (error) {
      logger.error(
        { error, paymentIntentId },
        "Could not read the intent back after a failed capture",
      );
      return false;
    }
  }

  /**
   * Best-effort release of an uncaptured authorization. Idempotent via the
   * intent-scoped key; on failure the auth self-expires within 7 days, so
   * log loudly but do not fail the handler.
   */
  private static async voidAuthorization(paymentIntentId: string, bookingId: string) {
    try {
      await stripe.paymentIntents.cancel(
        paymentIntentId,
        {},
        { idempotencyKey: `void_${paymentIntentId}` },
      );
    } catch (error) {
      logger.warn(
        { error, bookingId, paymentIntentId },
        "Failed to void authorization — it will expire on its own within 7 days",
      );
    }
  }

  /**
   * Upsert payment state and confirm booking atomically.
   */
  private static async handlePaymentSuccess(paymentIntent: Stripe.PaymentIntent, eventId: string) {
    const bookingId = paymentIntent?.metadata?.bookingId as string | undefined;
    if (!bookingId) {
      logger.error(
        { paymentIntentId: paymentIntent?.id },
        "Missing bookingId in payment intent metadata",
      );
      return;
    }

    const amount = Number(paymentIntent.amount_received ?? paymentIntent.amount);
    const amountInMainCurrency = Number.isFinite(amount) ? amount / 100 : 0;
    const paymentIntentPayload = toInputJsonObject(paymentIntent);

    let updatedPaymentId: string | null = null;
    let confirmedCount = 0;

    await prisma.$transaction(async (tx) => {
      const existingPayment = await tx.payment.findUnique({
        where: { bookingId },
        select: {
          id: true,
          metadata: true,
        },
      });

      if (!existingPayment) {
        const createdPayment = await tx.payment.create({
          data: {
            bookingId,
            amount: amountInMainCurrency,
            currency: String(paymentIntent.currency ?? "usd").toUpperCase(),
            provider: "STRIPE",
            status: "SUCCESS",
            transactionId: paymentIntent.id,
            metadata: {
              stripePayload: {
                paymentIntentSucceeded: paymentIntentPayload,
              },
            },
          },
        });

        updatedPaymentId = createdPayment.id;
      } else {
        const existingMetadata = getMetadataObject(existingPayment.metadata);
        const existingStripePayload = getStripePayloadObject(existingMetadata);

        const updatedPayment = await tx.payment.update({
          where: { id: existingPayment.id },
          data: {
            status: "SUCCESS",
            transactionId: paymentIntent.id,
            metadata: {
              ...existingMetadata,
              stripePayload: {
                ...existingStripePayload,
                paymentIntentSucceeded: paymentIntentPayload,
              },
            },
          },
        });

        updatedPaymentId = updatedPayment.id;
      }

      // Only a live booking may be confirmed. One cancelled while the guest
      // was mid-payment (guest cancel, unpaid-expiry sweep) must not be
      // resurrected; the late charge is refunded below instead.
      const confirmed = await tx.booking.updateMany({
        where: { id: bookingId, status: { in: ["PENDING", "CONFIRMED"] } },
        data: { status: "CONFIRMED" },
      });
      confirmedCount = confirmed.count;
    });

    if (confirmedCount === 0) {
      await this.refundLatePayment(bookingId, paymentIntent, updatedPaymentId);
      return;
    }

    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        user: {
          select: {
            email: true,
            firstName: true,
            lastName: true,
          },
        },
        property: {
          select: {
            title: true,
            owner: {
              select: {
                email: true,
                firstName: true,
              },
            },
          },
        },
      },
    });

    if (booking && updatedPaymentId) {
      await emailQueue.add(
        "payment-success-guest",
        {
          paymentId: updatedPaymentId,
          bookingId: booking.id,
          guestEmail: booking.user.email,
          guestFirstName: booking.user.firstName,
          propertyTitle: booking.property.title,
          checkIn: formatDate(booking.checkIn),
          checkOut: formatDate(booking.checkOut),
          amountPaid: amountInMainCurrency,
          currency: String(paymentIntent.currency ?? "usd").toUpperCase(),
        },
        { jobId: `payment-success-guest-${eventId}` },
      );

      await emailQueue.add(
        "payment-success-host",
        {
          paymentId: updatedPaymentId,
          bookingId: booking.id,
          hostEmail: booking.property.owner.email,
          hostFirstName: booking.property.owner.firstName,
          propertyTitle: booking.property.title,
          guestFirstName: booking.user.firstName,
          guestLastName: booking.user.lastName,
          checkIn: formatDate(booking.checkIn),
          checkOut: formatDate(booking.checkOut),
          amountPaid: amountInMainCurrency,
          currency: String(paymentIntent.currency ?? "usd").toUpperCase(),
        },
        { jobId: `payment-success-host-${eventId}` },
      );
    }

    logger.info({ bookingId, paymentIntentId: paymentIntent.id }, "Payment succeeded");
  }

  /**
   * A success event arrived for a booking that is no longer live (cancelled
   * while the guest was mid-payment). Refund the charge in full and park the
   * payment in REFUND_PROCESSING; the charge.refunded webhook finalizes it
   * to REFUNDED. Idempotent via the intent-scoped refund key.
   */
  private static async refundLatePayment(
    bookingId: string,
    paymentIntent: Stripe.PaymentIntent,
    paymentId: string | null,
  ) {
    logger.warn(
      { bookingId, paymentIntentId: paymentIntent.id },
      "Payment succeeded for a non-live booking — issuing full refund",
    );

    try {
      await stripe.refunds.create(
        { payment_intent: paymentIntent.id },
        { idempotencyKey: `late_payment_refund_${paymentIntent.id}` },
      );
    } catch (error) {
      logger.error(
        { error, bookingId, paymentIntentId: paymentIntent.id },
        "CRITICAL: refund for non-live booking failed — manual recovery required",
      );
      void sendOpsAlert({
        title: "Late payment refund failed",
        message:
          "A payment succeeded for a cancelled booking and the automatic refund failed. Manual recovery required.",
        context: { bookingId, paymentIntentId: paymentIntent.id },
      });
      return;
    }

    if (paymentId) {
      await prisma.payment.updateMany({
        where: { id: paymentId, status: "SUCCESS" },
        data: { status: "REFUND_PROCESSING" },
      });
    }
  }

  /**
   * Mark payment FAILED and persist provider payload.
   */
  private static async handlePaymentFailed(paymentIntent: Stripe.PaymentIntent) {
    const bookingId = paymentIntent?.metadata?.bookingId as string | undefined;
    if (!bookingId) {
      logger.warn(
        { paymentIntentId: paymentIntent?.id },
        "Missing bookingId in failed payment intent metadata",
      );
      return;
    }

    const existingPayment = await prisma.payment.findUnique({
      where: { bookingId },
      select: {
        id: true,
        metadata: true,
      },
    });

    if (existingPayment) {
      const existingMetadata = getMetadataObject(existingPayment.metadata);
      const existingStripePayload = getStripePayloadObject(existingMetadata);
      const paymentIntentFailedPayload = toInputJsonObject(paymentIntent);

      await prisma.payment.update({
        where: { id: existingPayment.id },
        data: {
          status: "FAILED",
          transactionId: paymentIntent.id,
          metadata: {
            ...existingMetadata,
            stripePayload: {
              ...existingStripePayload,
              paymentIntentFailed: paymentIntentFailedPayload,
            },
          },
        },
      });
    }

    logger.warn({ bookingId, paymentIntentId: paymentIntent.id }, "Payment failed");
  }

  /**
   * Sync refund from provider, update booking, and notify host.
   */
  private static async handleChargeRefunded(charge: Stripe.Charge, eventId: string) {
    const paymentIntentRaw = charge?.payment_intent;
    const paymentIntentId =
      typeof paymentIntentRaw === "string" ? paymentIntentRaw : paymentIntentRaw?.id;

    if (!paymentIntentId) {
      logger.warn({ chargeId: charge?.id }, "Missing payment_intent in charge.refunded webhook");
      return;
    }

    const payment = await prisma.payment.findFirst({
      where: { transactionId: paymentIntentId },
      include: {
        booking: {
          include: {
            user: {
              select: {
                firstName: true,
                lastName: true,
              },
            },
            property: {
              select: {
                title: true,
                owner: {
                  select: {
                    email: true,
                    firstName: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!payment) {
      logger.warn(
        { paymentIntentId, chargeId: charge?.id },
        "Payment not found for charge.refunded webhook",
      );
      return;
    }

    if (payment.status === "REFUNDED") {
      logger.info(
        { paymentId: payment.id, paymentIntentId, chargeId: charge?.id },
        "Skipping charge.refunded sync because payment is already refunded",
      );
      return;
    }

    const amountRefunded = new Prisma.Decimal(charge?.amount_refunded ?? 0).div(100);
    if (amountRefunded.lt(payment.amount)) {
      logger.info(
        {
          paymentId: payment.id,
          paymentIntentId,
          amountRefunded: amountRefunded.toFixed(2),
          paymentAmount: payment.amount.toFixed(2),
        },
        "charge.refunded is a partial refund; leaving payment status unchanged",
      );
      return;
    }

    const existingMetadata = getMetadataObject(payment.metadata);
    const existingAudit = getAuditObject(existingMetadata);
    const existingStripePayload = getStripePayloadObject(existingMetadata);

    await prisma.$transaction(async (tx) => {
      const chargeRefundedPayload = toInputJsonObject(charge);

      await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: "REFUNDED",
          metadata: {
            ...existingMetadata,
            audit: {
              ...existingAudit,
              refundFromStripeDashboard: {
                receivedAt: new Date().toISOString(),
                chargeId: charge?.id ?? null,
                paymentIntentId,
                amountRefunded: charge?.amount_refunded ?? null,
              },
            },
            stripePayload: {
              ...existingStripePayload,
              chargeRefunded: chargeRefundedPayload,
            },
          },
        },
      });

      await tx.booking.update({
        where: { id: payment.bookingId },
        data: {
          status: "CANCELLED",
          payoutStatus: "CANCELLED",
        },
      });
    });

    const chargeRefundedRaw = toFiniteNumber(charge?.amount_refunded);
    const refundedAmount =
      chargeRefundedRaw && chargeRefundedRaw > 0 ? chargeRefundedRaw / 100 : Number(payment.amount);
    const totalAmount = Number(payment.amount);
    const refundPercent =
      totalAmount > 0
        ? Math.min(100, Math.max(0, Math.round((refundedAmount / totalAmount) * 100)))
        : 100;

    await emailQueue.add(
      "refund-processed-host",
      {
        paymentId: payment.id,
        bookingId: payment.bookingId,
        hostEmail: payment.booking.property.owner.email,
        hostFirstName: payment.booking.property.owner.firstName,
        propertyTitle: payment.booking.property.title,
        guestFirstName: payment.booking.user.firstName,
        guestLastName: payment.booking.user.lastName,
        checkIn: formatDate(payment.booking.checkIn),
        checkOut: formatDate(payment.booking.checkOut),
        refundPercent,
        refundedAmount,
        totalAmount,
        currency: payment.currency,
      },
      { jobId: `refund-processed-host-${eventId}` },
    );

    logger.info(
      { paymentId: payment.id, bookingId: payment.bookingId, paymentIntentId },
      "Refund synchronized from charge.refunded webhook",
    );
  }
}
