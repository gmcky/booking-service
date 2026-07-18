import { prisma } from "../../shared/lib/prisma.js";
import { AppError } from "../../shared/middlewares/error.handler.js";
import { logger } from "../../shared/lib/logger.js";
import { stripe } from "../../shared/lib/stripe.js";
import type { PaginationParams } from "../../shared/types/index.js";
import { calculatePagination, createPaginatedResponse } from "../../shared/utils/pagination.js";
import type { CreateBookingInput, UpdateBookingDatesInput } from "./booking.types.js";
import { Prisma } from "@prisma/client";
import type { BookingStatus } from "@prisma/client";
import { emailQueue } from "../../shared/queues/email.queue.js";
import { calculateNights, formatDate } from "../../shared/utils/date.helpers.js";
import { getBookingRole } from "./booking.helpers.js";
import {
  calculateRefundPolicy,
  REFUND_POLICY,
  getAuditObject,
  getMetadataObject,
  getStripePayloadObject,
  toInputJsonObject,
} from "../payments/payment.helpers.js";
import {
  MAX_STAY_NIGHTS,
  UNPAID_EXPIRY_HOURS,
  UNPAID_EXPIRY_GRACE_MINUTES,
  UNPAID_CHECKIN_GRACE_HOURS,
} from "./booking.constants.js";
import { invalidateUserStatsCache } from "../users/user.stats.cache.js";
import { cacheInvalidateNamespace } from "../../shared/lib/cache.js";
import { sendOpsAlert } from "../../shared/lib/ops-alert.js";
import { setTimeout as sleep } from "timers/promises";

type TransactionClient = Prisma.TransactionClient;

const BOOKING_PROPERTY_SELECT = {
  id: true,
  title: true,
  description: true,
  type: true,
  city: true,
  district: true,
  street: true,
  houseNumber: true,
  apartment: true,
  images: true,
  pricePerNight: true,
  maxGuests: true,
  amenities: true,
  averageRating: true,
  reviewCount: true,
  ownerId: true,
} as const;

const BOOKING_DETAIL_PROPERTY_SELECT = {
  ...BOOKING_PROPERTY_SELECT,
  owner: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      avatarUrl: true,
      phoneNumber: true,
      email: true,
    },
  },
} as const;

// FSM transitions to block backward or skip steps.
const ALLOWED_TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  PENDING: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["COMPLETED", "CANCELLED"],
  CANCELLED: [],
  COMPLETED: [],
};

export class BookingService {
  static async getUserBookings(userId: string, params: PaginationParams) {
    const { skip, take } = calculatePagination(params.page, params.limit);

    const [bookings, total] = await Promise.all([
      prisma.booking.findMany({
        where: { userId },
        skip,
        take,
        include: {
          property: {
            select: {
              id: true,
              title: true,
              city: true,
              images: true,
            },
          },
          // Payment state distinguishes "pay now" from "processing" on the
          // trips list for PENDING bookings.
          payment: { select: { status: true } },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.booking.count({ where: { userId } }),
    ]);

    return createPaginatedResponse(bookings, total, params);
  }

  /**
   * List bookings on properties owned by the given host, with optional
   * status/property filters. Guest identity is exposed without email.
   */
  static async getHostBookings(
    ownerId: string,
    params: PaginationParams,
    filters: { status?: BookingStatus; propertyId?: string },
  ) {
    const { skip, take } = calculatePagination(params.page, params.limit);

    const where = {
      property: { ownerId },
      ...(filters.status && { status: filters.status }),
      ...(filters.propertyId && { propertyId: filters.propertyId }),
    };

    const [bookings, total] = await Promise.all([
      prisma.booking.findMany({
        where,
        skip,
        take,
        include: {
          property: {
            select: {
              id: true,
              title: true,
              city: true,
              images: true,
            },
          },
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.booking.count({ where }),
    ]);

    return createPaginatedResponse(bookings, total, params);
  }

  /**
   * RBAC gate for booking and payment snapshot access. Host contact details
   * (phone/email) are only attached for the guest or an admin, and only once
   * the booking is CONFIRMED or COMPLETED. For guests the reveal additionally
   * waits until check-in is inside the free-cancellation cutoff: revealing
   * while a 100% refund is still available would make book-peek-cancel a
   * zero-cost contact-harvesting loop.
   */
  static async getById(id: string, userId: string, userRole: string) {
    const booking = await prisma.booking.findUnique({
      where: { id },
      include: {
        property: { select: BOOKING_DETAIL_PROPERTY_SELECT },
        payment: {
          select: {
            id: true,
            amount: true,
            refundedAmount: true,
            currency: true,
            status: true,
            provider: true,
            transactionId: true,
            bookingId: true,
            createdAt: true,
            updatedAt: true,
          },
        },
        hostCancellationRequests: {
          where: { status: "PENDING" },
          select: { id: true, reason: true, createdAt: true },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    });

    if (!booking) {
      throw new AppError(404, "Booking not found");
    }

    const role = getBookingRole(booking, userId, userRole);
    if (role === "NONE") {
      throw new AppError(403, "Not authorized to view this booking");
    }

    const { phoneNumber, email, ...ownerPublic } = booking.property.owner;

    const insideCancellationCutoff =
      booking.checkIn.getTime() - Date.now() <= REFUND_POLICY.fullRefundAfterHours * 60 * 60 * 1000;
    const canSeeHostContact =
      role === "ADMIN"
        ? booking.status === "CONFIRMED" || booking.status === "COMPLETED"
        : role === "GUEST" &&
          (booking.status === "COMPLETED" ||
            (booking.status === "CONFIRMED" && insideCancellationCutoff));

    const { hostCancellationRequests, ...bookingRest } = booking;

    return {
      ...bookingRest,
      property: {
        ...booking.property,
        owner: ownerPublic,
      },
      hostContact: canSeeHostContact ? { phoneNumber, email } : null,
      // Surfaced to the guest so the trip page can show a "host requested to
      // cancel" banner. Contact gating above is unchanged.
      pendingHostCancellation: hostCancellationRequests?.[0] ?? null,
    };
  }

  /**
   * Host-facing booking detail. Guest contact (email/phone) is gated: revealed
   * only once the booking is CONFIRMED or COMPLETED — an unpaid PENDING booking
   * is an intent, not a commitment, and exposing contact invites off-platform
   * harvesting via throwaway bookings. Mirrors the guest-side host-contact rule.
   */
  static async getHostBookingById(id: string, ownerId: string) {
    const booking = await prisma.booking.findUnique({
      where: { id },
      include: {
        property: {
          select: { id: true, title: true, city: true, images: true, ownerId: true },
        },
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            avatarUrl: true,
            email: true,
            phoneNumber: true,
          },
        },
        payment: {
          select: { id: true, amount: true, currency: true, status: true, refundedAmount: true },
        },
        hostCancellationRequests: {
          select: {
            id: true,
            status: true,
            reason: true,
            createdAt: true,
            resolvedAt: true,
            autoApproved: true,
          },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    });

    if (!booking) {
      throw new AppError(404, "Booking not found");
    }

    if (booking.property.ownerId !== ownerId) {
      throw new AppError(403, "Not authorized to view this booking");
    }

    const canSeeGuestContact = booking.status === "CONFIRMED" || booking.status === "COMPLETED";
    const { email, phoneNumber, ...guestPublic } = booking.user;
    const { hostCancellationRequests, user: _user, ...bookingRest } = booking;

    return {
      ...bookingRest,
      guest: {
        ...guestPublic,
        contact: canSeeGuestContact ? { email, phoneNumber } : null,
      },
      cancellationRequest: hostCancellationRequests[0] ?? null,
    };
  }

  /**
   * Enforce policy guards and serialize overlap check + insert.
   */
  static async create(data: CreateBookingInput) {
    const { propertyId, userId, checkIn, checkOut, guests } = data;

    // Fail fast on guards before opening Serializable tx.
    if (checkIn.getTime() < new Date().setUTCHours(0, 0, 0, 0)) {
      throw new AppError(400, "Check-in cannot be in the past");
    }

    const nights = calculateNights(checkIn, checkOut);
    if (nights > MAX_STAY_NIGHTS) {
      throw new AppError(400, `Maximum stay is ${MAX_STAY_NIGHTS} nights`);
    }

    const property = await prisma.property.findUnique({
      where: { id: propertyId },
    });

    if (!property || !property.isActive) {
      throw new AppError(404, "Property not available");
    }

    if (property.ownerId === userId) {
      throw new AppError(400, "Cannot book your own property");
    }

    if (guests > property.maxGuests) {
      throw new AppError(400, `Maximum ${property.maxGuests} guests allowed`);
    }

    // Serializable tx closes race window on concurrent bookings.
    const runCreateTx = () =>
      prisma.$transaction(
        async (tx) => {
          const isAvailable = await this.checkAvailability(propertyId, checkIn, checkOut, tx);

          if (!isAvailable) {
            throw new AppError(409, "Property not available for selected dates");
          }

          const totalPrice = property.pricePerNight.mul(nights);

          return tx.booking.create({
            data: {
              propertyId,
              userId,
              checkIn,
              checkOut,
              guests,
              totalPrice,
            },
            include: {
              property: { select: BOOKING_PROPERTY_SELECT },
            },
          });
        },
        { isolationLevel: "Serializable" },
      );

    // Loop always assigns booking or throws; ! suppresses the definite-assignment error.
    let booking!: Awaited<ReturnType<typeof runCreateTx>>;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        booking = await runCreateTx();
        break;
      } catch (err) {
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === "P2034" &&
          attempt < 3
        ) {
          await sleep(50 * attempt);
          continue;
        }
        throw err;
      }
    }

    // Async enqueue for predictable API latency.
    this.enqueueBookingCreatedEmails(booking, userId).catch((err) =>
      logger.error({ err, bookingId: booking.id }, "Failed to enqueue booking-created emails"),
    );

    await Promise.all([
      invalidateUserStatsCache(userId, booking.property.ownerId),
      cacheInvalidateNamespace("properties:search"),
    ]);

    return booking;
  }

  /**
   * Handle host/admin forward transitions; cancellations use separate path.
   */
  static async updateStatus(id: string, userId: string, userRole: string, status: BookingStatus) {
    // Keep cancel side effects centralized (refunds, notifications).
    if (status === "CANCELLED") {
      throw new AppError(400, "Use DELETE /bookings/:id to cancel a booking");
    }

    const booking = await prisma.booking.findUnique({
      where: { id },
      include: {
        property: { select: { ownerId: true } },
      },
    });

    if (!booking) {
      throw new AppError(404, "Booking not found");
    }

    const role = getBookingRole(booking, userId, userRole);

    // Only host/admin can advance FSM.
    if (role === "NONE" || role === "GUEST") {
      throw new AppError(403, "Not authorized to update this booking");
    }

    const allowed = ALLOWED_TRANSITIONS[booking.status];
    if (!allowed.includes(status)) {
      throw new AppError(400, `Cannot transition from ${booking.status} to ${status}`);
    }

    if (status === "COMPLETED" && booking.checkOut.getTime() > Date.now()) {
      throw new AppError(400, "Cannot mark booking as completed before check-out time");
    }

    const updated = await prisma.booking.update({
      where: { id },
      data: { status },
    });

    await cacheInvalidateNamespace("properties:search");

    return updated;
  }

  /**
   * Allow COMPLETED status before scheduled check-out.
   */
  static async earlyCheckout(id: string, userId: string, userRole: string) {
    const booking = await prisma.booking.findUnique({
      where: { id },
      include: { property: { select: { ownerId: true } } },
    });

    if (!booking) {
      throw new AppError(404, "Booking not found");
    }

    const role = getBookingRole(booking, userId, userRole);

    if (role !== "GUEST" && role !== "ADMIN") {
      throw new AppError(403, "Not authorized to check out early");
    }

    if (booking.status !== "CONFIRMED") {
      throw new AppError(400, `Cannot early check out a booking with status ${booking.status}`);
    }

    if (booking.checkOut.getTime() <= Date.now()) {
      throw new AppError(400, "Check-out time has already passed; use PATCH /:id/status instead");
    }

    const now = new Date();
    const updated = await prisma.booking.update({
      where: { id },
      data: { status: "COMPLETED", actualCheckOutAt: now },
    });

    logger.info({ bookingId: id, userId, actualCheckOutAt: now }, "Early checkout completed");

    await cacheInvalidateNamespace("properties:search");

    return updated;
  }

  /**
   * Unified cancellation path with idempotency and refund-policy snapshot.
   */
  static async cancel(id: string, userId: string, userRole: string) {
    const booking = await prisma.booking.findUnique({
      where: { id },
      include: { property: true, payment: true },
    });

    if (!booking) {
      throw new AppError(404, "Booking not found");
    }

    const role = getBookingRole(booking, userId, userRole);

    if (role === "NONE") {
      throw new AppError(403, "Not authorized to cancel this booking");
    }

    // Hosts cannot unilaterally cancel a guest's booking: they file a request
    // that an admin approves (always a full refund). Guests and admins cancel
    // directly through this path.
    if (role === "HOST") {
      throw new AppError(
        403,
        "Hosts must request a cancellation for admin approval, not cancel directly",
      );
    }

    if (booking.status === "COMPLETED") {
      throw new AppError(400, "Cannot cancel completed booking");
    }

    if (booking.status === "CANCELLED") {
      return { booking, cancellation: null };
    }

    const cancelActor = role === "ADMIN" ? "ADMIN" : "GUEST";

    // Snapshot policy to avoid drift if constants change.
    const policy = calculateRefundPolicy(booking.checkIn);
    const hoursUntilCheckIn = policy.hoursUntilCheckIn;
    const refundPercent = policy.refundPercent;
    const refundAmount = (Number(booking.totalPrice) * refundPercent) / 100;

    logger.info(
      {
        bookingId: id,
        cancelledBy: role.toLowerCase(),
        refundPercent,
        refundAmount,
        hoursUntilCheckIn: Math.round(hoursUntilCheckIn),
        refundPolicy: {
          fullRefundAfterHours: REFUND_POLICY.fullRefundAfterHours,
          partialRefundAfterHours: REFUND_POLICY.partialRefundAfterHours,
          partialRefundPercent: REFUND_POLICY.partialRefundPercent,
        },
      },
      "Cancellation policy applied",
    );

    const cancelled =
      refundPercent > 0 && booking.payment?.status === "SUCCESS"
        ? await this.cancelPaidBookingWithRefund(
            booking,
            userId,
            role,
            refundPercent,
            refundAmount,
            cancelActor,
          )
        : await prisma.booking.update({
            where: { id },
            data: {
              status: "CANCELLED",
              cancelledBy: cancelActor,
              // Paid booking cancelled inside the no-refund window: the full
              // amount is still owed to the host, so the payout stays alive.
              payoutStatus: booking.payment?.status === "SUCCESS" ? "READY" : "CANCELLED",
            },
            include: { property: true },
          });

    // A direct cancellation (guest, or admin via this path) supersedes any open
    // host-cancellation request — void it so the admin queue doesn't act on a
    // booking that is already cancelled.
    await prisma.hostCancellationRequest.updateMany({
      where: { bookingId: id, status: "PENDING" },
      data: { status: "VOIDED", resolvedAt: new Date() },
    });

    this.enqueueCancellationEmails(cancelled, booking.userId).catch((err) =>
      logger.error({ err, bookingId: id }, "Failed to enqueue cancellation emails"),
    );

    await cacheInvalidateNamespace("properties:search");

    return {
      booking: cancelled,
      cancellation: {
        refundPercent,
        refundAmount,
        hoursUntilCheckIn,
        policy: {
          fullRefundAfterHours: REFUND_POLICY.fullRefundAfterHours,
          partialRefundAfterHours: REFUND_POLICY.partialRefundAfterHours,
          partialRefundPercent: REFUND_POLICY.partialRefundPercent,
        },
      },
    };
  }

  /**
   * Sweep unpaid PENDING bookings past their payment deadline and release
   * their dates. Payment is due by check-in (same-day bookings get a short
   * grace, since checkIn is stored as midnight and is already "past" at
   * creation), with the TTL capping far-future holds and checkOut as the
   * absolute stop. Availability queries only count PENDING/CONFIRMED, so
   * the status flip alone frees the range. The payment race is closed
   * twice: the sweep skips payment stubs touched within the grace window
   * (guest may be mid-checkout), and the success webhook refuses to
   * confirm a cancelled booking, refunding the late charge instead.
   */
  static async expireUnpaidBookings() {
    const now = new Date();
    const ttlCutoff = new Date(now.getTime() - UNPAID_EXPIRY_HOURS * 60 * 60 * 1000);
    const checkInGraceCutoff = new Date(
      now.getTime() - UNPAID_CHECKIN_GRACE_HOURS * 60 * 60 * 1000,
    );
    const paymentGrace = new Date(now.getTime() - UNPAID_EXPIRY_GRACE_MINUTES * 60 * 1000);

    const candidates = await prisma.booking.findMany({
      where: {
        status: "PENDING",
        AND: [
          {
            OR: [
              { payment: { is: null } },
              {
                payment: {
                  status: { in: ["PENDING", "FAILED"] },
                  updatedAt: { lte: paymentGrace },
                },
              },
            ],
          },
          {
            OR: [
              // Hold TTL exhausted.
              { createdAt: { lte: ttlCutoff } },
              // Stay window already over.
              { checkOut: { lte: now } },
              // Check-in has passed and the same-day grace is spent.
              { checkIn: { lte: now }, createdAt: { lte: checkInGraceCutoff } },
            ],
          },
        ],
      },
      select: {
        id: true,
        userId: true,
        checkIn: true,
        checkOut: true,
        property: { select: { title: true, ownerId: true } },
      },
    });

    let expired = 0;

    for (const booking of candidates) {
      // Re-check status in the write: the guest may have paid or cancelled
      // between the sweep query and this update.
      const { count } = await prisma.booking.updateMany({
        where: { id: booking.id, status: "PENDING" },
        data: { status: "CANCELLED", cancelledBy: "SYSTEM", payoutStatus: "CANCELLED" },
      });
      if (count === 0) continue;

      expired += 1;

      await prisma.hostCancellationRequest.updateMany({
        where: { bookingId: booking.id, status: "PENDING" },
        data: { status: "VOIDED", resolvedAt: new Date() },
      });

      logger.info(
        { bookingId: booking.id, userId: booking.userId },
        "Unpaid booking expired and released",
      );

      this.enqueueCancellationEmails(booking, booking.userId).catch((err) =>
        logger.error({ err, bookingId: booking.id }, "Failed to enqueue expiry emails"),
      );
    }

    if (expired > 0) {
      await cacheInvalidateNamespace("properties:search");
    }

    return { scanned: candidates.length, expired };
  }

  /**
   * Refund-first cancellation flow with database finalization retries.
   */
  private static async cancelPaidBookingWithRefund(
    booking: {
      id: string;
      userId: string;
      checkIn: Date;
      checkOut: Date;
      payoutStatus: BookingStatus | "PENDING" | "READY" | "PAID_OUT";
      payment: {
        id: string;
        bookingId: string;
        amount: Prisma.Decimal;
        currency: string;
        status: string;
        transactionId: string | null;
        metadata: Prisma.JsonValue | null;
      } | null;
      property: { title: string; ownerId: string };
    },
    cancelledByUserId: string,
    cancelledByRole: string,
    refundPercent: number,
    refundAmount: number,
    cancelActor: "GUEST" | "ADMIN",
  ) {
    const payment = booking.payment;
    if (!payment || payment.status !== "SUCCESS") {
      throw new AppError(400, "Booking is not eligible for direct refund");
    }

    if (booking.payoutStatus === "PAID_OUT") {
      throw new AppError(400, "Cannot cancel booking with refund after host payout was disbursed");
    }

    if (!payment.transactionId) {
      throw new AppError(400, "Missing payment transaction id");
    }

    const existingMetadata = getMetadataObject(payment.metadata);
    const existingAudit = getAuditObject(existingMetadata);
    const existingStripePayload = getStripePayloadObject(existingMetadata);

    const movedToProcessing = await prisma.payment.updateMany({
      where: {
        id: payment.id,
        status: "SUCCESS",
      },
      data: {
        status: "REFUND_PROCESSING",
      },
    });

    let shouldCallStripe = movedToProcessing.count > 0;
    if (!shouldCallStripe) {
      const latestPayment = await prisma.payment.findUnique({
        where: { id: payment.id },
        select: { status: true },
      });

      if (!latestPayment) {
        throw new AppError(404, "Payment not found");
      }

      if (latestPayment.status === "REFUNDED") {
        shouldCallStripe = false;
      } else if (latestPayment.status === "REFUND_PROCESSING") {
        // Replay idempotency key for recovery after timeouts.
        shouldCallStripe = true;
      } else {
        throw new AppError(400, "Payment is not eligible for direct refund");
      }
    }

    let stripeRefund: Awaited<ReturnType<typeof stripe.refunds.create>> | null = null;

    if (shouldCallStripe) {
      try {
        stripeRefund = await stripe.refunds.create(
          {
            payment_intent: payment.transactionId,
            amount: Math.round(refundAmount * 100),
            metadata: {
              paymentId: payment.id,
              bookingId: booking.id,
              cancellationByUserId: cancelledByUserId,
              cancellationByRole: cancelledByRole,
              refundPercent: String(refundPercent),
            },
          },
          {
            idempotencyKey: `booking_cancel_refund_${payment.id}`,
          },
        );
      } catch (error) {
        logger.error(
          { error, bookingId: booking.id, paymentId: payment.id },
          "Failed to create Stripe refund during booking cancellation",
        );
        throw new AppError(502, "Payment provider error during cancellation");
      }
    }

    const finalizeRefundTx = () =>
      prisma.$transaction(async (tx) => {
        await tx.payment.updateMany({
          where: {
            id: payment.id,
            status: { in: ["SUCCESS", "REFUND_PROCESSING"] },
          },
          data: {
            status: "REFUNDED",
            refundedAmount: refundAmount,
            metadata: {
              ...existingMetadata,
              audit: {
                ...existingAudit,
                bookingCancellationRefund: {
                  refundedAt: new Date().toISOString(),
                  cancelledBy: cancelledByUserId,
                  cancelledByRole,
                  refundPercent,
                  refundAmount,
                },
              },
              stripePayload: {
                ...existingStripePayload,
                ...(stripeRefund
                  ? {
                      bookingCancellationRefund: toInputJsonObject(stripeRefund),
                    }
                  : {}),
              },
            },
          },
        });

        return tx.booking.update({
          where: { id: booking.id },
          data: {
            status: "CANCELLED",
            cancelledBy: cancelActor,
            // Partial refund leaves a remainder owed to the host.
            payoutStatus: refundPercent < 100 ? "READY" : "CANCELLED",
          },
          include: { property: true },
        });
      });

    const MAX_FINALIZE_ATTEMPTS = 3;
    let cancelledBooking: Awaited<ReturnType<typeof finalizeRefundTx>> | null = null;
    let lastFinalizeError: unknown;

    for (let attempt = 1; attempt <= MAX_FINALIZE_ATTEMPTS; attempt++) {
      try {
        cancelledBooking = await finalizeRefundTx();
        break;
      } catch (err) {
        lastFinalizeError = err;
        logger.warn(
          { err, bookingId: booking.id, paymentId: payment.id, attempt },
          "Booking cancellation DB finalization failed — retrying",
        );
        if (attempt < MAX_FINALIZE_ATTEMPTS) await sleep(200 * attempt);
      }
    }

    if (!cancelledBooking) {
      // Manual recovery needed if Stripe refund is confirmed but DB write fails.
      void sendOpsAlert({
        title: "Booking cancellation DB finalization failed after retries",
        message:
          "Stripe refund was issued but booking/payment DB state could not be finalized. Manual recovery required.",
        context: {
          bookingId: booking.id,
          paymentId: payment.id,
          stripeRefundId: stripeRefund?.id ?? null,
          idempotencyKey: `booking_cancel_refund_${payment.id}`,
          error: String(lastFinalizeError),
        },
      });
      logger.error(
        { lastFinalizeError, bookingId: booking.id, paymentId: payment.id },
        "Booking cancellation DB finalization failed after all retries",
      );
      throw new AppError(
        500,
        "Your refund was processed but the booking status could not be updated. Our team has been alerted — contact support if the booking does not update within a few minutes.",
      );
    }

    return cancelledBooking;
  }

  /**
   * Reschedule flow: role guard + self-excluded overlap check.
   */
  static async updateDates(
    id: string,
    userId: string,
    userRole: string,
    data: UpdateBookingDatesInput,
  ) {
    // Host reschedule blocked to prevent unilateral shifts.
    const booking = await this.getById(id, userId, userRole);

    const role = getBookingRole(booking, userId, userRole);
    if (role === "HOST") {
      throw new AppError(403, "Hosts cannot reschedule guest bookings");
    }

    if (booking.status !== "PENDING" && booking.status !== "CONFIRMED") {
      throw new AppError(400, "Can only reschedule active bookings");
    }

    const newCheckIn = data.checkIn ?? booking.checkIn;
    const newCheckOut = data.checkOut ?? booking.checkOut;
    const newGuests = data.guests ?? booking.guests;

    if (newCheckOut <= newCheckIn) {
      throw new AppError(400, "Check-out must be after check-in");
    }

    const nights = calculateNights(newCheckIn, newCheckOut);
    if (nights > MAX_STAY_NIGHTS) {
      throw new AppError(400, `Maximum stay is ${MAX_STAY_NIGHTS} nights`);
    }

    const property = booking.property;

    if (newGuests > property.maxGuests) {
      throw new AppError(400, `Maximum ${property.maxGuests} guests allowed`);
    }

    const result = await prisma.$transaction(
      async (tx) => {
        const isAvailable = await this.checkAvailability(
          booking.propertyId,
          newCheckIn,
          newCheckOut,
          tx,
          id, // Avoid false conflict on same booking.
        );
        if (!isAvailable) {
          throw new AppError(409, "Property not available for selected dates");
        }

        const totalPrice = property.pricePerNight.mul(nights);

        return tx.booking.update({
          where: { id },
          data: {
            checkIn: newCheckIn,
            checkOut: newCheckOut,
            guests: newGuests,
            totalPrice,
          },
          include: { property: { select: BOOKING_PROPERTY_SELECT } },
        });
      },
      { isolationLevel: "Serializable" },
    );

    await cacheInvalidateNamespace("properties:search");

    return result;
  }

  /**
   * Aggregate future unavailable ranges from bookings and manual blocks.
   */
  static async getBlockedDates(propertyId: string) {
    const property = await prisma.property.findUnique({
      where: { id: propertyId },
      select: { id: true },
    });
    if (!property) {
      throw new AppError(404, "Property not found");
    }

    const [bookedRanges, blockedRanges] = await Promise.all([
      prisma.booking.findMany({
        where: {
          propertyId,
          status: { in: ["PENDING", "CONFIRMED"] },
          checkOut: { gt: new Date() },
        },
        select: { checkIn: true, checkOut: true },
        orderBy: { checkIn: "asc" },
      }),
      prisma.blockedDate.findMany({
        where: {
          propertyId,
          endDate: { gt: new Date() },
        },
        select: { startDate: true, endDate: true, reason: true },
        orderBy: { startDate: "asc" },
      }),
    ]);

    return { bookedRanges, blockedRanges };
  }

  /**
   * Overlap predicate for booking and blocked-date windows.
   */
  static async checkAvailability(
    propertyId: string,
    checkIn: Date,
    checkOut: Date,
    tx: TransactionClient = prisma,
    excludeBookingId?: string,
  ): Promise<boolean> {
    const overlappingBookings = await tx.booking.count({
      where: {
        propertyId,
        status: { in: ["PENDING", "CONFIRMED"] },
        checkIn: { lt: checkOut },
        checkOut: { gt: checkIn },
        ...(excludeBookingId ? { id: { not: excludeBookingId } } : {}),
      },
    });

    if (overlappingBookings > 0) return false;

    const blockedDates = await tx.blockedDate.count({
      where: {
        propertyId,
        startDate: { lt: checkOut },
        endDate: { gt: checkIn },
      },
    });

    return blockedDates === 0;
  }

  private static async enqueueBookingCreatedEmails(
    booking: {
      id: string;
      propertyId: string;
      checkIn: Date;
      checkOut: Date;
      guests: number;
      totalPrice: Prisma.Decimal | number;
      property: { title: string; city: string; ownerId: string };
    },
    userId: string,
  ) {
    const [guest, host] = await Promise.all([
      prisma.user.findFirst({
        where: { id: userId, isDeleted: false },
        select: { email: true, firstName: true, lastName: true },
      }),
      prisma.user.findFirst({
        where: { id: booking.property.ownerId, isDeleted: false },
        select: { email: true, firstName: true },
      }),
    ]);

    if (!guest) return;

    const nights = calculateNights(booking.checkIn, booking.checkOut);

    await emailQueue.add("booking-created-guest", {
      bookingId: booking.id,
      guestEmail: guest.email,
      guestFirstName: guest.firstName,
      propertyTitle: booking.property.title,
      propertyCity: booking.property.city,
      checkIn: formatDate(booking.checkIn),
      checkOut: formatDate(booking.checkOut),
      nights,
      guests: booking.guests,
      totalPrice: Number(booking.totalPrice),
    });

    if (!host) {
      logger.warn(
        {
          bookingId: booking.id,
          propertyId: booking.propertyId,
          ownerId: booking.property.ownerId,
        },
        "Host user not found, skipping booking-created-host email",
      );
      return;
    }

    try {
      await emailQueue.add("booking-created-host", {
        bookingId: booking.id,
        hostEmail: host.email,
        hostFirstName: host.firstName,
        guestFirstName: guest.firstName,
        guestLastName: guest.lastName,
        propertyTitle: booking.property.title,
        propertyCity: booking.property.city,
        checkIn: formatDate(booking.checkIn),
        checkOut: formatDate(booking.checkOut),
        nights,
        guests: booking.guests,
      });
    } catch (err) {
      logger.error(
        {
          err,
          bookingId: booking.id,
          propertyId: booking.propertyId,
          ownerId: booking.property.ownerId,
          hostEmail: host.email,
        },
        "Failed to enqueue booking-created-host email",
      );
    }
  }

  private static async enqueueCancellationEmails(
    booking: {
      id: string;
      userId: string;
      checkIn: Date;
      checkOut: Date;
      property: { title: string; ownerId: string };
    },
    userId: string,
  ) {
    const [guest, host] = await Promise.all([
      prisma.user.findFirst({
        where: { id: userId, isDeleted: false },
        select: { email: true, firstName: true, lastName: true },
      }),
      prisma.user.findFirst({
        where: { id: booking.property.ownerId, isDeleted: false },
        select: { email: true, firstName: true },
      }),
    ]);

    const sharedPayload = {
      bookingId: booking.id,
      propertyTitle: booking.property.title,
      checkIn: formatDate(booking.checkIn),
      checkOut: formatDate(booking.checkOut),
    };

    if (guest) {
      await emailQueue.add("booking-cancelled-guest", {
        ...sharedPayload,
        guestEmail: guest.email,
        guestFirstName: guest.firstName,
      });
    }

    if (guest && host) {
      await emailQueue.add("booking-cancelled-host", {
        ...sharedPayload,
        hostEmail: host.email,
        hostFirstName: host.firstName,
        guestFirstName: guest.firstName,
        guestLastName: guest.lastName,
      });
    }
  }
}
