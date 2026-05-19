import { prisma } from "../../shared/lib/prisma.js";
import { Prisma } from "@prisma/client";
import { AppError } from "../../shared/middlewares/error.handler.js";
import { logger } from "../../shared/lib/logger.js";
import { stripe } from "../../shared/lib/stripe.js";
import { env } from "../../config/env.js";
import { emailQueue } from "../../shared/queues/email.queue.js";
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
  /** Verifies webhook signature, deduplicates events, then dispatches handlers. */
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

    // Handler runs before the dedup record is written. If the app crashes
    // mid-handler the record is never inserted, so Stripe will retry and
    // the handler will run again — correct. Handlers must be idempotent;
    // email jobs carry a jobId so BullMQ deduplicates on concurrent delivery.
    switch (stripeEvent.type) {
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
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        // Concurrent delivery: another request processed the same event.
        // Handler already ran (idempotent), so this is safe to ignore.
        return { success: true };
      }

      logger.error(
        { error, stripeEventId: stripeEvent.id, eventType: stripeEvent.type },
        "Failed to record processed Stripe event — handler succeeded but dedup record missing",
      );
    }

    return { success: true };
  }

  /** Success sync: upsert payment state and confirm booking in one transaction. */
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
        { jobId: `payment-success-guest:${eventId}` },
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
        { jobId: `payment-success-host:${eventId}` },
      );
    }

    logger.info({ bookingId, paymentIntentId: paymentIntent.id }, "Payment succeeded");
  }

  /** Failure sync: mark payment as FAILED and persist provider payload. */
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

  /** Refund sync from provider event; updates payment/booking and notifies host. */
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
      { jobId: `refund-processed-host:${eventId}` },
    );

    logger.info(
      { paymentId: payment.id, bookingId: payment.bookingId, paymentIntentId },
      "Refund synchronized from charge.refunded webhook",
    );
  }
}
