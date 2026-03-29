import { prisma } from "../../shared/lib/prisma.js";
import { AppError } from "../../shared/middlewares/error.handler.js";
import { logger } from "../../shared/lib/logger.js";
import type { PaginationParams } from "../../shared/types/index.js";
import {
  calculatePagination,
  createPaginatedResponse,
} from "../../shared/utils/pagination.js";
import type {
  CreateBookingInput,
  UpdateBookingDatesInput,
} from "./booking.types.js";
import { Prisma } from "@prisma/client";
import type { BookingStatus } from "@prisma/client";
import { emailQueue } from "../../shared/queues/email.queue.js";
import {
  calculateNights,
  formatDate,
} from "../../shared/utils/date.helpers.js";
import { getBookingRole } from "./booking.helpers.js";
import {
  calculateRefundPolicy,
  REFUND_POLICY,
} from "../payments/payment.helpers.js";
import {
  MAX_STAY_NIGHTS,
  MIN_ADVANCE_HOURS,
} from "./booking.constants.js";

type TransactionClient = Prisma.TransactionClient;

// Only forward transitions allowed
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
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.booking.count({ where: { userId } }),
    ]);

    return createPaginatedResponse(bookings, total, params);
  }

  static async getById(id: string, userId: string, userRole: string) {
    const booking = await prisma.booking.findUnique({
      where: { id },
      include: {
        property: true,
        payment: {
          select: {
            id: true,
            amount: true,
            currency: true,
            status: true,
            provider: true,
            transactionId: true,
            bookingId: true,
            createdAt: true,
            updatedAt: true,
          },
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

    return booking;
  }

  static async create(data: CreateBookingInput) {
    const { propertyId, userId, checkIn, checkOut, guests } = data;

    // Date guards (before hitting the DB)
    const now = new Date();
    const hoursUntilCheckIn =
      (checkIn.getTime() - now.getTime()) / (1000 * 60 * 60);
    if (hoursUntilCheckIn < MIN_ADVANCE_HOURS) {
      throw new AppError(400, "Check-in must be at least 24 hours from now");
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

    // Atomic availability check + insert to prevent race conditions
    const booking = await prisma.$transaction(
      async (tx) => {
        const isAvailable = await this.checkAvailability(
          propertyId,
          checkIn,
          checkOut,
          tx,
        );

        if (!isAvailable) {
          throw new AppError(409, "Property not available for selected dates");
        }

        const totalPrice = Number(property.pricePerNight) * nights;

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
            property: true,
          },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    // Enqueue booking emails (fire-and-forget, don't block response)
    this.enqueueBookingCreatedEmails(booking, userId).catch((err) =>
      logger.error(
        { err, bookingId: booking.id },
        "Failed to enqueue booking-created emails",
      ),
    );

    // TODO: Return a user-facing booking DTO.
    // The current response is intentionally verbose for testing,
    // but later we should hide internal IDs and expose only fields the user needs.
    return booking;
  }

  static async updateStatus(
    id: string,
    userId: string,
    userRole: string,
    status: BookingStatus,
  ) {
    // CANCELLED is not allowed here — all cancellations go through cancel().
    // This keeps refund calculation, logging, and notification in one place.
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

    // ── Role resolution ───────────────────────────────────────────────────────
    const role = getBookingRole(booking, userId, userRole);

    // Only hosts and admins can drive forward transitions (CONFIRMED, COMPLETED).
    // Guests have no business using this endpoint.
    if (role === "NONE" || role === "GUEST") {
      throw new AppError(403, "Not authorized to update this booking");
    }

    // ── State-machine guard ───────────────────────────────────────────────────
    const allowed = ALLOWED_TRANSITIONS[booking.status];
    if (!allowed.includes(status)) {
      throw new AppError(
        400,
        `Cannot transition from ${booking.status} to ${status}`,
      );
    }

    return prisma.booking.update({
      where: { id },
      data: { status },
    });
  }

  static async cancel(id: string, userId: string, userRole: string) {
    // Single source of truth for all cancellations (guest, host, admin).
    // We fetch with property so we can resolve the host role AND have
    // property.title / property.ownerId available for notification emails.
    const booking = await prisma.booking.findUnique({
      where: { id },
      include: { property: true },
    });

    if (!booking) {
      throw new AppError(404, "Booking not found");
    }

    // ── Role resolution ───────────────────────────────────────────────────────
    const role = getBookingRole(booking, userId, userRole);

    if (role === "NONE") {
      throw new AppError(403, "Not authorized to cancel this booking");
    }

    // ── Business guards ───────────────────────────────────────────────────────
    if (booking.status === "COMPLETED") {
      throw new AppError(400, "Cannot cancel completed booking");
    }

    if (booking.status === "CANCELLED") {
      const policy = calculateRefundPolicy(booking.checkIn);
      const refundPercent = policy.refundPercent;
      const refundAmount = (Number(booking.totalPrice) * refundPercent) / 100;

      return {
        booking,
        cancellation: {
          refundPercent,
          refundAmount,
          hoursUntilCheckIn: policy.hoursUntilCheckIn,
          policy: {
            fullRefundAfterHours: REFUND_POLICY.fullRefundAfterHours,
            partialRefundAfterHours: REFUND_POLICY.partialRefundAfterHours,
            partialRefundPercent: REFUND_POLICY.partialRefundPercent,
          },
        },
      }; // Idempotent — safe to call twice
    }

    // ── Cancellation / refund policy ──────────────────────────────────────────
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

    // TODO: delegate actual refund to PaymentService when Stripe is integrated

    const cancelled = await prisma.booking.update({
      where: { id },
      data: { status: "CANCELLED" },
      include: { property: true },
    });

    // Enqueue cancellation emails (fire-and-forget).
    // Always use booking.userId (the guest) as the recipient, regardless of
    // who initiated the cancellation.
    this.enqueueCancellationEmails(cancelled, booking.userId).catch((err) =>
      logger.error(
        { err, bookingId: id },
        "Failed to enqueue cancellation emails",
      ),
    );

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

  static async updateDates(
    id: string,
    userId: string,
    userRole: string,
    data: UpdateBookingDatesInput,
  ) {
    // Only guests (the booking owner) and admins may reschedule.
    // Hosts must not silently shift a guest's confirmed dates.
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

    const property = await prisma.property.findUnique({
      where: { id: booking.propertyId },
    });
    if (!property) {
      throw new AppError(404, "Property not found");
    }

    if (newGuests > property.maxGuests) {
      throw new AppError(400, `Maximum ${property.maxGuests} guests allowed`);
    }

    return prisma.$transaction(
      async (tx) => {
        const isAvailable = await this.checkAvailability(
          booking.propertyId,
          newCheckIn,
          newCheckOut,
          tx,
          id, // exclude this booking itself from the overlap check
        );
        if (!isAvailable) {
          throw new AppError(409, "Property not available for selected dates");
        }

        const totalPrice = Number(property.pricePerNight) * nights;

        return tx.booking.update({
          where: { id },
          data: {
            checkIn: newCheckIn,
            checkOut: newCheckOut,
            guests: newGuests,
            totalPrice,
          },
          include: { property: true },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

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
        // When rescheduling, exclude the booking being updated so it doesn't
        // conflict with its own current dates.
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

  // ---- Private helpers ----

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
      prisma.user.findUnique({
        where: { id: userId },
        select: { email: true, firstName: true, lastName: true },
      }),
      prisma.user.findUnique({
        where: { id: booking.property.ownerId },
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
      prisma.user.findUnique({
        where: { id: userId },
        select: { email: true, firstName: true, lastName: true },
      }),
      prisma.user.findUnique({
        where: { id: booking.property.ownerId },
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
