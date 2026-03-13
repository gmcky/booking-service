import { prisma } from "../../shared/lib/prisma.js";
import { AppError } from "../../shared/middlewares/error.handler.js";
import { logger } from "../../shared/lib/logger.js";
import type { PaginationParams } from "../../shared/types/index.js";
import {
  calculatePagination,
  createPaginatedResponse,
} from "../../shared/utils/pagination.js";
import type { CreateBookingInput } from "./booking.types.js";
import type { BookingStatus } from "@prisma/client";

// TODO: Import email/cleanup queues when email notifications are implemented
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

  static async getById(id: string, userId: string) {
    const booking = await prisma.booking.findUnique({
      where: { id },
      include: {
        property: true,
        payment: true,
      },
    });

    if (!booking) {
      throw new AppError(404, "Booking not found");
    }

    if (booking.userId !== userId) {
      throw new AppError(403, "Not authorized to view this booking");
    }

    return booking;
  }

  static async create(data: CreateBookingInput) {
    const { propertyId, userId, checkIn, checkOut, guests } = data;

    // TODO: Add date validation
    // - checkIn must be at least 24h in the future
    // - checkOut must be after checkIn
    // - Enforce a maximum booking duration (e.g., 90 days)

    // Check if property exists and is active
    const property = await prisma.property.findUnique({
      where: { id: propertyId },
    });

    if (!property || !property.isActive) {
      throw new AppError(404, "Property not available");
    }

    // TODO: Prevent self-booking — users shouldn't book their own properties
    if (property.ownerId === userId) {
      throw new AppError(400, "Cannot book your own property");
    }

    // Check max guests
    if (guests > property.maxGuests) {
      throw new AppError(400, `Maximum ${property.maxGuests} guests allowed`);
    }

    // TODO: Wrap availability check + booking creation in a Prisma interactive
    // transaction to prevent race conditions (concurrent double-bookings).
    // Use optimistic locking or serializable isolation level.

    // Check availability
    const isAvailable = await this.checkAvailability(
      propertyId,
      checkIn,
      checkOut,
    );

    if (!isAvailable) {
      throw new AppError(409, "Property not available for selected dates");
    }

    // Calculate total price
    const nights = Math.ceil(
      (checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24),
    );
    const totalPrice = Number(property.pricePerNight) * nights;

    return prisma.booking.create({
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

    // TODO: Trigger background jobs (email confirmation, PDF receipt) via BullMQ
  }

  static async updateStatus(id: string, userId: string, status: BookingStatus) {
    const booking = await this.getById(id, userId);

    // Business logic: what status transitions are allowed
    if (booking.status === "CANCELLED") {
      throw new AppError(400, "Cannot update cancelled booking");
    }

    return prisma.booking.update({
      where: { id },
      data: { status },
    });
  }

  static async cancel(id: string, userId: string) {
    const booking = await this.getById(id, userId);

    if (booking.status === "COMPLETED") {
      throw new AppError(400, "Cannot cancel completed booking");
    }

    if (booking.status === "CANCELLED") {
      return booking; // Already cancelled — idempotent
    }

    // TODO: Apply cancellation policy before updating status:
    // - >48h before check-in → 100% refund
    // - 24–48h before check-in → 50% refund
    // - <24h before check-in → no refund
    // Delegate refund processing and emails to PaymentService + BullMQ jobs.

    await prisma.booking.update({
      where: { id },
      data: { status: "CANCELLED" },
    });
  }

  static async checkAvailability(
    propertyId: string,
    checkIn: Date,
    checkOut: Date,
  ): Promise<boolean> {
    // Check for overlapping bookings
    const overlappingBookings = await prisma.booking.count({
      where: {
        propertyId,
        status: { in: ["PENDING", "CONFIRMED"] },
        checkIn: { lt: checkOut },
        checkOut: { gt: checkIn },
      },
    });

    if (overlappingBookings > 0) return false;

    // Check for blocked dates
    const blockedDates = await prisma.blockedDate.count({
      where: {
        propertyId,
        startDate: { lt: checkOut },
        endDate: { gt: checkIn },
      },
    });

    return blockedDates === 0;
  }
}
