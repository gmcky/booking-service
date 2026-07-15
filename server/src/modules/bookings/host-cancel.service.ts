import { prisma } from "../../shared/lib/prisma.js";
import { AppError } from "../../shared/middlewares/error.handler.js";
import { logger } from "../../shared/lib/logger.js";
import { stripe } from "../../shared/lib/stripe.js";
import { emailQueue } from "../../shared/queues/email.queue.js";
import { sendOpsAlert } from "../../shared/lib/ops-alert.js";
import { PlatformSettingsService } from "../../shared/lib/platform-settings.service.js";
import { calculatePagination, createPaginatedResponse } from "../../shared/utils/pagination.js";
import type { PaginationParams } from "../../shared/types/index.js";
import { formatDate } from "../../shared/utils/date.helpers.js";
import {
  getAuditObject,
  getMetadataObject,
  getStripePayloadObject,
  toInputJsonObject,
} from "../payments/payment.helpers.js";
import { cacheInvalidateNamespace } from "../../shared/lib/cache.js";
import { setTimeout as sleep } from "timers/promises";
import { Prisma } from "@prisma/client";
import type { HostCancellationStatus } from "@prisma/client";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Host-initiated cancellation flow. A host asks to cancel a confirmed booking,
 * an admin (or the auto-approve worker) resolves it, and approval always issues
 * a 100% refund to the guest. Mirrors the payment refund machinery: Stripe
 * idempotency keys, a SUCCESS→REFUND_PROCESSING transition guard, finalize
 * retries, and an ops alert if the DB write fails after a real refund.
 */
export class HostCancellationService {
  /** Host files a cancellation request against their own confirmed booking. */
  static async requestCancellation(bookingId: string, hostUserId: string, reason: string) {
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        property: { select: { title: true, ownerId: true } },
        user: { select: { firstName: true, lastName: true, email: true } },
      },
    });

    if (!booking) {
      throw new AppError(404, "Booking not found");
    }

    // Only the property owner can request a host cancellation. Admins have the
    // approve path instead, so they never file requests.
    if (booking.property.ownerId !== hostUserId) {
      throw new AppError(403, "Only the host of this booking can request a cancellation");
    }

    if (booking.status !== "CONFIRMED") {
      throw new AppError(400, "Only confirmed bookings can be cancelled by the host");
    }

    if (booking.checkIn.getTime() <= Date.now()) {
      throw new AppError(400, "Cannot request cancellation after check-in has started");
    }

    let request;
    try {
      request = await prisma.hostCancellationRequest.create({
        data: { bookingId, requestedById: hostUserId, reason },
      });
    } catch (err) {
      // Partial unique index (one PENDING request per booking) maps to P2002.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        throw new AppError(409, "A cancellation request for this booking is already pending");
      }
      throw err;
    }

    const host = await prisma.user.findUnique({
      where: { id: hostUserId },
      select: { firstName: true, lastName: true },
    });

    await emailQueue.add("host-cancel-requested-guest", {
      bookingId: booking.id,
      guestEmail: booking.user.email,
      guestFirstName: booking.user.firstName,
      propertyTitle: booking.property.title,
      checkIn: formatDate(booking.checkIn),
      checkOut: formatDate(booking.checkOut),
      reason,
    });

    const admins = await prisma.user.findMany({
      where: { role: "ADMIN", isDeleted: false },
      select: { email: true, firstName: true },
    });

    await Promise.all(
      admins.map((admin) =>
        emailQueue.add("host-cancel-requested-admin", {
          adminEmail: admin.email,
          adminFirstName: admin.firstName,
          requestId: request.id,
          bookingId: booking.id,
          hostFullName: host ? `${host.firstName} ${host.lastName}` : "Unknown host",
          guestFullName: `${booking.user.firstName} ${booking.user.lastName}`,
          propertyTitle: booking.property.title,
          checkIn: formatDate(booking.checkIn),
          checkOut: formatDate(booking.checkOut),
          reason,
        }),
      ),
    );

    return request;
  }

  /**
   * Host declines a still-PENDING reservation. Instant — no admin approval,
   * because nothing was committed yet (the host never confirmed). The booking
   * is cancelled and, if the guest already paid, refunded in full to their
   * card. Same money machinery as approval, minus the request record.
   */
  static async declinePending(bookingId: string, hostUserId: string) {
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        property: { select: { title: true, ownerId: true } },
        user: { select: { email: true, firstName: true } },
        payment: {
          select: {
            id: true,
            amount: true,
            currency: true,
            status: true,
            transactionId: true,
            metadata: true,
          },
        },
      },
    });

    if (!booking) {
      throw new AppError(404, "Booking not found");
    }
    if (booking.property.ownerId !== hostUserId) {
      throw new AppError(403, "Only the host of this booking can decline it");
    }
    if (booking.status !== "PENDING") {
      throw new AppError(400, "Only pending reservations can be declined");
    }
    if (booking.payoutStatus === "PAID_OUT") {
      throw new AppError(400, "Cannot decline: host payout has already been disbursed");
    }

    const payment = booking.payment;
    const refundable = Boolean(
      payment &&
      (payment.status === "SUCCESS" || payment.status === "REFUND_PROCESSING") &&
      payment.transactionId,
    );
    const refundAmount = payment ? Number(payment.amount) : 0;

    let stripeRefund: Awaited<ReturnType<typeof stripe.refunds.create>> | null = null;

    if (refundable && payment) {
      const moved = await prisma.payment.updateMany({
        where: { id: payment.id, status: "SUCCESS" },
        data: { status: "REFUND_PROCESSING" },
      });

      let callStripe = moved.count > 0;
      if (!callStripe) {
        const latest = await prisma.payment.findUnique({
          where: { id: payment.id },
          select: { status: true },
        });
        if (!latest) throw new AppError(404, "Payment not found");
        if (latest.status === "REFUNDED") callStripe = false;
        else if (latest.status === "REFUND_PROCESSING") callStripe = true;
        else throw new AppError(400, "Payment is not eligible for refund");
      }

      if (callStripe) {
        try {
          stripeRefund = await stripe.refunds.create(
            {
              payment_intent: payment.transactionId!,
              amount: Math.round(refundAmount * 100),
              metadata: {
                paymentId: payment.id,
                bookingId: booking.id,
                hostDeclined: "true",
              },
            },
            { idempotencyKey: `host_decline_refund_${payment.id}` },
          );
        } catch (error) {
          logger.error(
            { error, bookingId: booking.id, paymentId: payment.id },
            "Failed to create Stripe refund during host decline",
          );
          throw new AppError(502, "Payment provider error during decline");
        }
      }
    }

    const existingMetadata = payment ? getMetadataObject(payment.metadata) : {};
    const existingAudit = getAuditObject(existingMetadata);
    const existingStripePayload = getStripePayloadObject(existingMetadata);
    const declinedAt = new Date();

    const finalizeTx = () =>
      prisma.$transaction(async (tx) => {
        if (refundable && payment) {
          await tx.payment.updateMany({
            where: { id: payment.id, status: { in: ["SUCCESS", "REFUND_PROCESSING"] } },
            data: {
              status: "REFUNDED",
              refundedAmount: refundAmount,
              metadata: {
                ...existingMetadata,
                audit: {
                  ...existingAudit,
                  hostDeclineRefund: {
                    refundedAt: declinedAt.toISOString(),
                    declinedBy: hostUserId,
                    refundAmount,
                    refundPercent: 100,
                  },
                },
                stripePayload: {
                  ...existingStripePayload,
                  ...(stripeRefund ? { hostDeclineRefund: toInputJsonObject(stripeRefund) } : {}),
                },
              },
            },
          });
        }

        return tx.booking.update({
          where: { id: booking.id },
          data: { status: "CANCELLED", cancelledBy: "HOST", payoutStatus: "CANCELLED" },
        });
      });

    const MAX_ATTEMPTS = 3;
    let finalized: Awaited<ReturnType<typeof finalizeTx>> | null = null;
    let lastError: unknown;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        finalized = await finalizeTx();
        break;
      } catch (err) {
        lastError = err;
        logger.warn(
          { err, bookingId: booking.id, attempt },
          "Host decline DB finalization failed — retrying",
        );
        if (attempt < MAX_ATTEMPTS) await sleep(200 * attempt);
      }
    }

    if (!finalized) {
      void sendOpsAlert({
        title: "Host decline DB finalization failed after retries",
        message:
          "Stripe refund may have been issued but the booking could not be cancelled. Manual recovery required.",
        context: {
          bookingId: booking.id,
          paymentId: payment?.id ?? null,
          stripeRefundId: stripeRefund?.id ?? null,
          idempotencyKey: payment ? `host_decline_refund_${payment.id}` : null,
          error: String(lastError),
        },
      });
      logger.error(
        { lastError, bookingId: booking.id },
        "Host decline DB finalization failed after all retries",
      );
      throw new AppError(
        500,
        "The reservation could not be declined. Our team has been alerted — please retry shortly.",
      );
    }

    await emailQueue.add("host-declined-guest", {
      bookingId: booking.id,
      guestEmail: booking.user.email,
      guestFirstName: booking.user.firstName,
      propertyTitle: booking.property.title,
      checkIn: formatDate(booking.checkIn),
      checkOut: formatDate(booking.checkOut),
      refundedAmount: refundAmount,
      currency: payment?.currency ?? "USD",
    });

    // Dates are free again.
    await cacheInvalidateNamespace("properties:search");

    return finalized;
  }

  /** Admin queue, oldest first (manual review order). */
  static async listRequests(
    params: PaginationParams,
    filters: { status?: HostCancellationStatus },
  ) {
    const { skip, take } = calculatePagination(params.page, params.limit);
    const where = filters.status ? { status: filters.status } : {};

    const [items, total] = await Promise.all([
      prisma.hostCancellationRequest.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: "asc" },
        include: {
          booking: {
            select: {
              id: true,
              checkIn: true,
              checkOut: true,
              totalPrice: true,
              status: true,
              property: { select: { id: true, title: true, city: true } },
              user: { select: { id: true, firstName: true, lastName: true } },
              payment: { select: { amount: true, currency: true, status: true } },
            },
          },
          requestedBy: { select: { id: true, firstName: true, lastName: true } },
        },
      }),
      prisma.hostCancellationRequest.count({ where }),
    ]);

    return createPaginatedResponse(items, total, params);
  }

  /** Admin approves a pending request (issues full refund + cancels booking). */
  static async approve(requestId: string, adminId: string) {
    const request = await this.loadForFinalize(requestId);
    if (!request) {
      throw new AppError(404, "Cancellation request not found");
    }
    return this.finalizeApproval(request, { adminId, autoApproved: false });
  }

  /** Admin rejects a pending request; booking is left untouched. */
  static async reject(requestId: string, adminId: string, reason?: string) {
    const request = await prisma.hostCancellationRequest.findUnique({
      where: { id: requestId },
      include: {
        booking: {
          select: {
            id: true,
            checkIn: true,
            checkOut: true,
            property: {
              select: { title: true, owner: { select: { email: true, firstName: true } } },
            },
          },
        },
      },
    });

    if (!request) {
      throw new AppError(404, "Cancellation request not found");
    }

    const moved = await prisma.hostCancellationRequest.updateMany({
      where: { id: requestId, status: "PENDING" },
      data: { status: "REJECTED", resolvedById: adminId, resolvedAt: new Date() },
    });

    if (moved.count === 0) {
      const latest = await prisma.hostCancellationRequest.findUnique({ where: { id: requestId } });
      if (!latest) throw new AppError(404, "Cancellation request not found");
      if (latest.status === "REJECTED") return latest; // idempotent
      throw new AppError(400, "Request is no longer pending");
    }

    const booking = request.booking;
    await emailQueue.add("host-cancel-rejected-host", {
      bookingId: booking.id,
      hostEmail: booking.property.owner.email,
      hostFirstName: booking.property.owner.firstName,
      propertyTitle: booking.property.title,
      checkIn: formatDate(booking.checkIn),
      checkOut: formatDate(booking.checkOut),
      reason: reason ?? null,
    });

    return prisma.hostCancellationRequest.findUnique({ where: { id: requestId } });
  }

  /**
   * Auto-approve requests left pending past the configured window, so guests
   * never hang in limbo behind an unresponsive admin. No-ops when disabled.
   */
  static async autoApproveStale() {
    const settings = await PlatformSettingsService.get();
    if (!settings.hostCancelAutoApproveEnabled) {
      return { enabled: false, approved: 0, failed: 0 };
    }

    const cutoff = new Date(Date.now() - settings.hostCancelAutoApproveDays * MS_PER_DAY);
    const stale = await prisma.hostCancellationRequest.findMany({
      where: { status: "PENDING", createdAt: { lte: cutoff } },
      select: { id: true },
    });

    let approved = 0;
    let failed = 0;
    for (const { id } of stale) {
      try {
        const request = await this.loadForFinalize(id);
        if (!request) continue;
        await this.finalizeApproval(request, { adminId: null, autoApproved: true });
        approved++;
      } catch (err) {
        failed++;
        logger.error({ err, requestId: id }, "Auto-approve of host cancellation failed");
      }
    }

    return { enabled: true, approved, failed };
  }

  private static loadForFinalize(requestId: string) {
    return prisma.hostCancellationRequest.findUnique({
      where: { id: requestId },
      include: {
        booking: {
          include: {
            property: {
              select: {
                title: true,
                ownerId: true,
                owner: { select: { email: true, firstName: true } },
              },
            },
            user: { select: { email: true, firstName: true, lastName: true } },
            payment: {
              select: {
                id: true,
                amount: true,
                currency: true,
                status: true,
                transactionId: true,
                metadata: true,
              },
            },
          },
        },
      },
    });
  }

  /**
   * Shared approval path for both admin approve and worker auto-approve.
   * Issues a 100% refund when the booking was paid, cancels the booking, and
   * resolves the request — all idempotently.
   */
  private static async finalizeApproval(
    request: NonNullable<Awaited<ReturnType<typeof HostCancellationService.loadForFinalize>>>,
    resolution: { adminId: string | null; autoApproved: boolean },
  ) {
    if (request.status === "APPROVED") {
      return request; // idempotent replay
    }
    if (request.status !== "PENDING") {
      throw new AppError(400, "Request is no longer pending");
    }

    const booking = request.booking;

    // Guest (or admin) cancelled first: don't double-cancel, just void.
    if (booking.status === "CANCELLED") {
      return prisma.hostCancellationRequest.update({
        where: { id: request.id },
        data: { status: "VOIDED", resolvedAt: new Date() },
      });
    }
    if (booking.status !== "CONFIRMED") {
      throw new AppError(400, `Cannot cancel a booking with status ${booking.status}`);
    }
    if (booking.payoutStatus === "PAID_OUT") {
      throw new AppError(400, "Cannot cancel: host payout has already been disbursed");
    }

    const payment = booking.payment;
    // REFUND_PROCESSING is included for recovery: a prior attempt may have
    // issued the Stripe refund but failed to finalize the DB writes. Replaying
    // (same idempotency key) is safe and finishes the transition to REFUNDED.
    const refundable = Boolean(
      payment &&
      (payment.status === "SUCCESS" || payment.status === "REFUND_PROCESSING") &&
      payment.transactionId,
    );
    const refundAmount = payment ? Number(payment.amount) : 0;

    let stripeRefund: Awaited<ReturnType<typeof stripe.refunds.create>> | null = null;

    if (refundable && payment) {
      // Transition SUCCESS→REFUND_PROCESSING once; recover if already processing.
      const moved = await prisma.payment.updateMany({
        where: { id: payment.id, status: "SUCCESS" },
        data: { status: "REFUND_PROCESSING" },
      });

      let callStripe = moved.count > 0;
      if (!callStripe) {
        const latest = await prisma.payment.findUnique({
          where: { id: payment.id },
          select: { status: true },
        });
        if (!latest) throw new AppError(404, "Payment not found");
        if (latest.status === "REFUNDED") callStripe = false;
        else if (latest.status === "REFUND_PROCESSING") callStripe = true;
        else throw new AppError(400, "Payment is not eligible for refund");
      }

      if (callStripe) {
        try {
          stripeRefund = await stripe.refunds.create(
            {
              payment_intent: payment.transactionId!,
              amount: Math.round(refundAmount * 100),
              metadata: {
                paymentId: payment.id,
                bookingId: booking.id,
                hostCancellationRequestId: request.id,
                autoApproved: String(resolution.autoApproved),
              },
            },
            { idempotencyKey: `host_cancel_refund_${payment.id}` },
          );
        } catch (error) {
          logger.error(
            { error, bookingId: booking.id, paymentId: payment.id, requestId: request.id },
            "Failed to create Stripe refund during host cancellation",
          );
          throw new AppError(502, "Payment provider error during host cancellation");
        }
      }
    }

    const existingMetadata = payment ? getMetadataObject(payment.metadata) : {};
    const existingAudit = getAuditObject(existingMetadata);
    const existingStripePayload = getStripePayloadObject(existingMetadata);
    const resolvedAt = new Date();

    const finalizeTx = () =>
      prisma.$transaction(async (tx) => {
        if (refundable && payment) {
          await tx.payment.updateMany({
            where: { id: payment.id, status: { in: ["SUCCESS", "REFUND_PROCESSING"] } },
            data: {
              status: "REFUNDED",
              refundedAmount: refundAmount,
              metadata: {
                ...existingMetadata,
                audit: {
                  ...existingAudit,
                  hostCancellationRefund: {
                    refundedAt: resolvedAt.toISOString(),
                    requestId: request.id,
                    approvedBy: resolution.adminId,
                    autoApproved: resolution.autoApproved,
                    refundAmount,
                    refundPercent: 100,
                  },
                },
                stripePayload: {
                  ...existingStripePayload,
                  ...(stripeRefund
                    ? { hostCancellationRefund: toInputJsonObject(stripeRefund) }
                    : {}),
                },
              },
            },
          });
        }

        await tx.booking.update({
          where: { id: booking.id },
          data: {
            status: "CANCELLED",
            cancelledBy: "HOST",
            // Full refund: nothing owed to the host.
            payoutStatus: "CANCELLED",
          },
        });

        return tx.hostCancellationRequest.update({
          where: { id: request.id },
          data: {
            status: "APPROVED",
            resolvedById: resolution.adminId,
            autoApproved: resolution.autoApproved,
            resolvedAt,
          },
        });
      });

    const MAX_ATTEMPTS = 3;
    let finalized: Awaited<ReturnType<typeof finalizeTx>> | null = null;
    let lastError: unknown;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        finalized = await finalizeTx();
        break;
      } catch (err) {
        lastError = err;
        logger.warn(
          { err, bookingId: booking.id, requestId: request.id, attempt },
          "Host cancellation DB finalization failed — retrying",
        );
        if (attempt < MAX_ATTEMPTS) await sleep(200 * attempt);
      }
    }

    if (!finalized) {
      void sendOpsAlert({
        title: "Host cancellation DB finalization failed after retries",
        message:
          "Stripe refund may have been issued but booking/request state could not be finalized. Manual recovery required.",
        context: {
          bookingId: booking.id,
          paymentId: payment?.id ?? null,
          requestId: request.id,
          stripeRefundId: stripeRefund?.id ?? null,
          idempotencyKey: payment ? `host_cancel_refund_${payment.id}` : null,
          error: String(lastError),
        },
      });
      logger.error(
        { lastError, bookingId: booking.id, requestId: request.id },
        "Host cancellation DB finalization failed after all retries",
      );
      throw new AppError(
        500,
        "The cancellation could not be finalized. Our team has been alerted — please retry shortly.",
      );
    }

    await emailQueue.add("host-cancel-approved-guest", {
      bookingId: booking.id,
      guestEmail: booking.user.email,
      guestFirstName: booking.user.firstName,
      propertyTitle: booking.property.title,
      checkIn: formatDate(booking.checkIn),
      checkOut: formatDate(booking.checkOut),
      refundedAmount: refundAmount,
      currency: payment?.currency ?? "USD",
      autoApproved: resolution.autoApproved,
    });

    return finalized;
  }
}
