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
  private static readonly AUTO_APPROVE_REFUND_DAYS = 7;

  private static formatDate(date: Date) {
    return new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
      timeZone: "UTC",
    }).format(date);
  }

  private static toFiniteNumber(value: unknown): number | null {
    const parsed =
      typeof value === "number"
        ? value
        : typeof value === "string"
          ? Number(value)
          : NaN;

    return Number.isFinite(parsed) ? parsed : null;
  }

  private static getMetadataObject(metadata: Prisma.JsonValue | null) {
    if (metadata && typeof metadata === "object" && !Array.isArray(metadata)) {
      return metadata as Prisma.JsonObject;
    }

    return {} as Prisma.JsonObject;
  }

  private static getAuditObject(metadata: Prisma.JsonObject) {
    const auditRaw = metadata.audit;
    if (auditRaw && typeof auditRaw === "object" && !Array.isArray(auditRaw)) {
      return auditRaw as Prisma.JsonObject;
    }

    return {} as Prisma.JsonObject;
  }

  private static getStripePayloadObject(metadata: Prisma.JsonObject) {
    const stripePayloadRaw = metadata.stripePayload;
    if (
      stripePayloadRaw &&
      typeof stripePayloadRaw === "object" &&
      !Array.isArray(stripePayloadRaw)
    ) {
      return stripePayloadRaw as Prisma.JsonObject;
    }

    return {} as Prisma.JsonObject;
  }

  private static toInputJsonObject(value: unknown): Prisma.InputJsonObject {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonObject;
  }

  private static calculateRefundPolicy(checkIn: Date) {
    const msUntilCheckIn = checkIn.getTime() - Date.now();
    const hoursUntilCheckIn = msUntilCheckIn / (1000 * 60 * 60);
    const daysUntilCheckIn = Math.max(0, Math.ceil(hoursUntilCheckIn / 24));
    const isAutoApprove = daysUntilCheckIn > this.AUTO_APPROVE_REFUND_DAYS;

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
      isAutoApprove,
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
      throw new AppError(404, "Payment not found");
    }

    if (payment.booking.userId !== userId) {
      throw new AppError(403, "Not authorized");
    }

    if (payment.status === "REFUND_REQUESTED") {
      return payment;
    }

    if (payment.status === "REFUND_PROCESSING") {
      return payment;
    }

    if (payment.status !== "SUCCESS") {
      throw new AppError(
        400,
        "Refund request can only be created for successful payments",
      );
    }

    if (payment.booking.payoutStatus === "PAID_OUT") {
      throw new AppError(
        400,
        "Cannot request refund after payout has been disbursed to host",
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
    const existingAudit = this.getAuditObject(existingMetadata);
    const existingStripePayload = this.getStripePayloadObject(existingMetadata);
    const refundAmount =
      (Number(payment.amount) * Number(policy.refundPercent)) / 100;
    const refundRequestedAt = new Date().toISOString();

    // TODO: Implement refund abuse prevention based on user refund history.
    // If user exceeds automatic-refund thresholds, force admin review instead.
    if (policy.isAutoApprove) {
      if (!payment.transactionId) {
        throw new AppError(400, "Missing payment transaction id");
      }

      const processingPayment = await prisma.payment.update({
        where: { id },
        data: {
          status: "REFUND_PROCESSING",
          metadata: {
            ...existingMetadata,
            audit: {
              ...existingAudit,
              refundRequest: {
                requestedAt: refundRequestedAt,
                requestedBy: userId,
                refundPercent: policy.refundPercent,
                refundAmount,
                daysUntilCheckIn: policy.daysUntilCheckIn,
                reason: reason ?? null,
              },
            },
          },
        },
      });

      const processingMetadata = this.getMetadataObject(
        processingPayment.metadata,
      );
      const processingAudit = this.getAuditObject(processingMetadata);
      const processingStripePayload =
        this.getStripePayloadObject(processingMetadata);

      let stripeRefund;
      try {
        stripeRefund = await stripe.refunds.create(
          {
            payment_intent: payment.transactionId,
            amount: Math.round(refundAmount * 100),
            metadata: {
              paymentId: payment.id,
              bookingId: payment.bookingId,
              autoApproved: "true",
              refundReason: reason ?? "",
            },
          },
          {
            idempotencyKey: `refund_auto_${payment.id}`,
          },
        );
      } catch (error) {
        logger.error(
          { error, paymentId: payment.id, bookingId: payment.bookingId },
          "Failed to create Stripe auto-approved refund",
        );
        throw new AppError(502, "Payment provider error during auto refund");
      }

      const refundedPayment = await prisma.$transaction(async (tx) => {
        const stripeRefundPayload = this.toInputJsonObject(stripeRefund);

        const updatedPayment = await tx.payment.update({
          where: { id },
          data: {
            status: "REFUNDED",
            metadata: {
              ...processingMetadata,
              audit: {
                ...processingAudit,
                refundAutoApproval: {
                  approvedAt: new Date().toISOString(),
                  stripeRefundId: stripeRefund.id,
                  refundAmount,
                  refundPercent: policy.refundPercent,
                },
              },
              stripePayload: {
                ...processingStripePayload,
                autoApprovedRefund: stripeRefundPayload,
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

        return updatedPayment;
      });

      await emailQueue.add("refund-processed-guest", {
        paymentId: refundedPayment.id,
        bookingId: refundedPayment.bookingId,
        guestEmail: payment.booking.user.email,
        guestFirstName: payment.booking.user.firstName,
        propertyTitle: payment.booking.property.title,
        isApproved: true,
        reason: reason ?? null,
      });

      await emailQueue.add("refund-processed-host", {
        paymentId: refundedPayment.id,
        bookingId: refundedPayment.bookingId,
        hostEmail: payment.booking.property.owner.email,
        hostFirstName: payment.booking.property.owner.firstName,
        propertyTitle: payment.booking.property.title,
        guestFirstName: payment.booking.user.firstName,
        guestLastName: payment.booking.user.lastName,
        checkIn: this.formatDate(payment.booking.checkIn),
        checkOut: this.formatDate(payment.booking.checkOut),
        refundPercent: policy.refundPercent,
        refundedAmount: refundAmount,
        totalAmount: Number(payment.amount),
        currency: payment.currency,
      });

      return refundedPayment;
    }

    const updatedPayment = await prisma.payment.update({
      where: { id },
      data: {
        status: "REFUND_REQUESTED",
        metadata: {
          ...existingMetadata,
          audit: {
            ...existingAudit,
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
      throw new AppError(404, "Payment not found");
    }

    if (
      payment.status === "REFUND_PROCESSING" ||
      payment.status === "REFUNDED"
    ) {
      return payment;
    }

    if (payment.status !== "REFUND_REQUESTED") {
      throw new AppError(400, "Payment is not waiting for refund approval");
    }

    if (payment.booking.payoutStatus === "PAID_OUT") {
      throw new AppError(
        400,
        "Cannot approve refund after payout has been disbursed to host",
      );
    }

    if (!payment.transactionId) {
      throw new AppError(400, "Missing payment transaction id");
    }

    const existingMetadata = this.getMetadataObject(payment.metadata);
    const existingAudit = this.getAuditObject(existingMetadata);
    const existingStripePayload = this.getStripePayloadObject(existingMetadata);
    const refundRequestRaw = existingAudit.refundRequest;
    const refundRequest =
      refundRequestRaw &&
      typeof refundRequestRaw === "object" &&
      !Array.isArray(refundRequestRaw)
        ? (refundRequestRaw as Prisma.JsonObject)
        : null;

    const paymentAmount = Number(payment.amount);
    const requestedRefundAmount = this.toFiniteNumber(
      refundRequest?.refundAmount,
    );
    const refundAmount =
      requestedRefundAmount &&
      requestedRefundAmount > 0 &&
      requestedRefundAmount <= paymentAmount
        ? requestedRefundAmount
        : paymentAmount;
    const refundPercent =
      paymentAmount > 0
        ? Math.min(
            100,
            Math.max(0, Math.round((refundAmount / paymentAmount) * 100)),
          )
        : 100;

    const movedToProcessing = await prisma.payment.updateMany({
      where: {
        id,
        status: "REFUND_REQUESTED",
      },
      data: {
        status: "REFUND_PROCESSING",
      },
    });

    if (movedToProcessing.count === 0) {
      const latestPayment = await prisma.payment.findUnique({ where: { id } });
      if (!latestPayment) {
        throw new AppError(404, "Payment not found");
      }

      if (
        latestPayment.status === "REFUND_PROCESSING" ||
        latestPayment.status === "REFUNDED"
      ) {
        return latestPayment;
      }

      throw new AppError(400, "Payment is not waiting for refund approval");
    }

    let stripeRefund;
    try {
      stripeRefund = await stripe.refunds.create(
        {
          payment_intent: payment.transactionId,
          amount: Math.round(refundAmount * 100),
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

    const updatedPayment = await prisma.$transaction(async (tx) => {
      const stripeRefundPayload = this.toInputJsonObject(stripeRefund);

      const updatedPayment = await tx.payment.update({
        where: { id },
        data: {
          status: "REFUNDED",
          metadata: {
            ...existingMetadata,
            audit: {
              ...existingAudit,
              refundApproval: {
                approvedAt: new Date().toISOString(),
                approvedBy: adminId,
                stripeRefundId: stripeRefund.id,
                refundAmount,
                refundPercent,
              },
            },
            stripePayload: {
              ...existingStripePayload,
              approvedRefund: stripeRefundPayload,
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

    await emailQueue.add("refund-processed-host", {
      paymentId: updatedPayment.id,
      bookingId: updatedPayment.bookingId,
      hostEmail: payment.booking.property.owner.email,
      hostFirstName: payment.booking.property.owner.firstName,
      propertyTitle: payment.booking.property.title,
      guestFirstName: payment.booking.user.firstName,
      guestLastName: payment.booking.user.lastName,
      checkIn: this.formatDate(payment.booking.checkIn),
      checkOut: this.formatDate(payment.booking.checkOut),
      refundPercent,
      refundedAmount: refundAmount,
      totalAmount: Number(payment.amount),
      currency: payment.currency,
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
    const existingAudit = this.getAuditObject(existingMetadata);

    const updatedPayment = await prisma.payment.update({
      where: { id },
      data: {
        status: "SUCCESS",
        metadata: {
          ...existingMetadata,
          audit: {
            ...existingAudit,
            refundRejection: {
              rejectedAt: new Date().toISOString(),
              rejectedBy: adminId,
              reason: reason ?? null,
            },
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
                paymentIntentSucceeded: paymentIntent,
              },
            },
          },
        });

        updatedPaymentId = createdPayment.id;
      } else {
        const existingMetadata = this.getMetadataObject(
          existingPayment.metadata,
        );
        const existingStripePayload =
          this.getStripePayloadObject(existingMetadata);

        const updatedPayment = await tx.payment.update({
          where: { id: existingPayment.id },
          data: {
            status: "SUCCESS",
            transactionId: paymentIntent.id,
            metadata: {
              ...existingMetadata,
              stripePayload: {
                ...existingStripePayload,
                paymentIntentSucceeded: paymentIntent,
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

      await emailQueue.add("payment-success-host", {
        paymentId: updatedPaymentId,
        bookingId: booking.id,
        hostEmail: booking.property.owner.email,
        hostFirstName: booking.property.owner.firstName,
        propertyTitle: booking.property.title,
        guestFirstName: booking.user.firstName,
        guestLastName: booking.user.lastName,
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

    const existingPayment = await prisma.payment.findUnique({
      where: { bookingId },
      select: {
        id: true,
        metadata: true,
      },
    });

    if (existingPayment) {
      const existingMetadata = this.getMetadataObject(existingPayment.metadata);
      const existingStripePayload =
        this.getStripePayloadObject(existingMetadata);

      await prisma.payment.update({
        where: { id: existingPayment.id },
        data: {
          status: "FAILED",
          transactionId: paymentIntent.id,
          metadata: {
            ...existingMetadata,
            stripePayload: {
              ...existingStripePayload,
              paymentIntentFailed: paymentIntent,
            },
          },
        },
      });
    }

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

    const existingMetadata = this.getMetadataObject(payment.metadata);
    const existingAudit = this.getAuditObject(existingMetadata);
    const existingStripePayload = this.getStripePayloadObject(existingMetadata);

    await prisma.$transaction(async (tx) => {
      const chargeRefundedPayload = this.toInputJsonObject(charge);

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

    const chargeRefundedRaw = this.toFiniteNumber(charge?.amount_refunded);
    const refundedAmount =
      chargeRefundedRaw && chargeRefundedRaw > 0
        ? chargeRefundedRaw / 100
        : Number(payment.amount);
    const totalAmount = Number(payment.amount);
    const refundPercent =
      totalAmount > 0
        ? Math.min(
            100,
            Math.max(0, Math.round((refundedAmount / totalAmount) * 100)),
          )
        : 100;

    await emailQueue.add("refund-processed-host", {
      paymentId: payment.id,
      bookingId: payment.bookingId,
      hostEmail: payment.booking.property.owner.email,
      hostFirstName: payment.booking.property.owner.firstName,
      propertyTitle: payment.booking.property.title,
      guestFirstName: payment.booking.user.firstName,
      guestLastName: payment.booking.user.lastName,
      checkIn: this.formatDate(payment.booking.checkIn),
      checkOut: this.formatDate(payment.booking.checkOut),
      refundPercent,
      refundedAmount,
      totalAmount,
      currency: payment.currency,
    });

    logger.info(
      { paymentId: payment.id, bookingId: payment.bookingId, paymentIntentId },
      "Refund synchronized from charge.refunded webhook",
    );
  }
}
