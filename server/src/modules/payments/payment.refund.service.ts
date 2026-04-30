import { prisma } from "../../shared/lib/prisma.js";
import { Prisma } from "@prisma/client";
import { AppError } from "../../shared/middlewares/error.handler.js";
import { logger } from "../../shared/lib/logger.js";
import { stripe } from "../../shared/lib/stripe.js";
import { emailQueue } from "../../shared/queues/email.queue.js";
import {
  calculateRefundPolicy,
  formatDate,
  getAuditObject,
  getMetadataObject,
  getStripePayloadObject,
  toFiniteNumber,
  toInputJsonObject,
} from "./payment.helpers.js";

export class PaymentRefundService {
  /** Refund request flow with policy gate and optional auto-approval path. */
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

    if (
      payment.status === "REFUND_REQUESTED" ||
      payment.status === "REFUND_PROCESSING"
    ) {
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

    const policy = calculateRefundPolicy(payment.booking.checkIn);
    if (policy.msUntilCheckIn <= 0) {
      throw new AppError(400, "Cannot request refund after check-in date");
    }

    if (policy.refundPercent === 0) {
      throw new AppError(
        400,
        "Refund request is not allowed less than 24 hours before check-in",
      );
    }

    // Safe snapshot: following update only mutates status.
    const existingMetadata = getMetadataObject(payment.metadata);
    const existingAudit = getAuditObject(existingMetadata);
    const existingStripePayload = getStripePayloadObject(existingMetadata);
    const refundAmount =
      (Number(payment.amount) * Number(policy.refundPercent)) / 100;
    const refundRequestedAt = new Date().toISOString();

    // TODO: add refund-abuse guard from user history.
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

      const processingMetadata = getMetadataObject(processingPayment.metadata);
      const processingAudit = getAuditObject(processingMetadata);
      const processingStripePayload =
        getStripePayloadObject(processingMetadata);

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
            idempotencyKey: `refund_${payment.id}`,
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
        const stripeRefundPayload = toInputJsonObject(stripeRefund);

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
        checkIn: formatDate(payment.booking.checkIn),
        checkOut: formatDate(payment.booking.checkOut),
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
      where: { role: "ADMIN", isDeleted: false },
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
          checkIn: formatDate(payment.booking.checkIn),
          checkOut: formatDate(payment.booking.checkOut),
          refundPercent: policy.refundPercent,
          refundAmount,
          reason: reason ?? null,
        }),
      ),
    );

    return updatedPayment;
  }

  /** Admin approval flow with idempotent state transition and provider refund call. */
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

    if (payment.status === "REFUNDED") {
      return payment;
    }

    if (
      payment.status !== "REFUND_REQUESTED" &&
      payment.status !== "REFUND_PROCESSING"
    ) {
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

    const existingMetadata = getMetadataObject(payment.metadata);
    const existingAudit = getAuditObject(existingMetadata);
    const existingStripePayload = getStripePayloadObject(existingMetadata);
    const refundRequestRaw = existingAudit.refundRequest;
    const refundRequest =
      refundRequestRaw &&
      typeof refundRequestRaw === "object" &&
      !Array.isArray(refundRequestRaw)
        ? (refundRequestRaw as Prisma.JsonObject)
        : null;

    const paymentAmount = Number(payment.amount);
    const requestedRefundAmount = toFiniteNumber(refundRequest?.refundAmount);
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

    // Step 1: move to processing once; if already processing, continue recovery path.
    if (payment.status === "REFUND_REQUESTED") {
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

        if (latestPayment.status !== "REFUND_PROCESSING") {
          if (latestPayment.status === "REFUNDED") {
            return latestPayment;
          }
          throw new AppError(400, "Payment is not waiting for refund approval");
        }
      }
    }

    // TODO: add compensation/outbox for Stripe-success + DB-failure window.
    // TODO: align approveRefund transition semantics with requestRefund flow.
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

    const finalized = await prisma.$transaction(async (tx) => {
      const stripeRefundPayload = toInputJsonObject(stripeRefund);

      // Re-fetch inside tx so any audit entries written between initial fetch
      // and this transaction are not overwritten by stale existingMetadata.
      const latestPaymentState = await tx.payment.findUnique({
        where: { id },
        select: { metadata: true },
      });
      const freshMetadata = getMetadataObject(latestPaymentState?.metadata ?? null);
      const freshAudit = getAuditObject(freshMetadata);
      const freshStripePayload = getStripePayloadObject(freshMetadata);

      const updatedPayment = await tx.payment.updateMany({
        where: {
          id,
          status: { in: ["REFUND_REQUESTED", "REFUND_PROCESSING"] },
        },
        data: {
          status: "REFUNDED",
          metadata: {
            ...freshMetadata,
            audit: {
              ...freshAudit,
              refundApproval: {
                approvedAt: new Date().toISOString(),
                approvedBy: adminId,
                stripeRefundId: stripeRefund.id,
                refundAmount,
                refundPercent,
              },
            },
            stripePayload: {
              ...freshStripePayload,
              approvedRefund: stripeRefundPayload,
            },
          },
        },
      });

      const booking = await tx.booking.update({
        where: { id: payment.bookingId },
        data: {
          status: "CANCELLED",
          payoutStatus: "CANCELLED",
        },
      });

      const currentPayment = await tx.payment.findUnique({ where: { id } });
      if (!currentPayment) {
        throw new AppError(404, "Payment not found");
      }

      return {
        payment: currentPayment,
        newlyFinalized: updatedPayment.count > 0,
        booking,
      };
    });

    if (finalized.newlyFinalized) {
      await emailQueue.add("refund-processed-guest", {
        paymentId: finalized.payment.id,
        bookingId: finalized.payment.bookingId,
        guestEmail: payment.booking.user.email,
        guestFirstName: payment.booking.user.firstName,
        propertyTitle: payment.booking.property.title,
        isApproved: true,
        reason: null,
      });

      await emailQueue.add("refund-processed-host", {
        paymentId: finalized.payment.id,
        bookingId: finalized.payment.bookingId,
        hostEmail: payment.booking.property.owner.email,
        hostFirstName: payment.booking.property.owner.firstName,
        propertyTitle: payment.booking.property.title,
        guestFirstName: payment.booking.user.firstName,
        guestLastName: payment.booking.user.lastName,
        checkIn: formatDate(payment.booking.checkIn),
        checkOut: formatDate(payment.booking.checkOut),
        refundPercent,
        refundedAmount: refundAmount,
        totalAmount: Number(payment.amount),
        currency: payment.currency,
      });
    }

    return finalized.payment;
  }

  /** Admin rejection flow that restores payment to SUCCESS state. */
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

    const existingMetadata = getMetadataObject(payment.metadata);
    const existingAudit = getAuditObject(existingMetadata);

    const updatedPayment = await prisma.payment.update({
      where: { id },
      data: {
        // Rejection keeps captured payment active.
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
}
