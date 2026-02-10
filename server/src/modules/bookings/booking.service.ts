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

// TODO: Import BullMQ for background job processing
// import { Queue } from 'bullmq';
// import { redis } from '../../shared/lib/redis.js';
// const emailQueue = new Queue('email-notifications', { connection: redis });
// const pdfQueue = new Queue('pdf-generation', { connection: redis });

/**
 * BookingService - Core business logic for the booking system
 *
 * CRITICAL IMPROVEMENTS NEEDED:
 * 1. Add Prisma Interactive Transactions to prevent race conditions
 * 2. Implement database-level locking (SELECT FOR UPDATE)
 * 3. Integrate BullMQ for async email/PDF generation
 * 4. Add comprehensive logging for business events
 * 5. Implement cancellation policy with refund logic
 * 6. Add unit/integration tests for concurrent scenarios
 */
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

    // TODO: Add input validation for dates
    // - checkIn must be in the future (at least 24h from now)
    // - checkOut must be after checkIn
    // - Maximum booking duration (e.g., 90 days)
    // const now = new Date();
    // const minCheckIn = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    // if (checkIn < minCheckIn) throw new AppError(400, 'Check-in must be at least 24h in future');

    // Check if property exists and is active
    const property = await prisma.property.findUnique({
      where: { id: propertyId },
    });

    if (!property || !property.isActive) {
      throw new AppError(404, "Property not available");
    }

    // TODO: Prevent self-booking - users shouldn't book their own properties
    // if (property.ownerId === userId) {
    //   throw new AppError(400, 'Cannot book your own property');
    // }

    // Check max guests
    if (guests > property.maxGuests) {
      throw new AppError(400, `Maximum ${property.maxGuests} guests allowed`);
    }

    // ⚠️ CRITICAL RACE CONDITION BUG HERE! ⚠️
    // Current implementation has a race condition:
    // 1. User A checks availability -> returns true
    // 2. User B checks availability -> returns true (A hasn't created booking yet)
    // 3. User A creates booking
    // 4. User B creates booking -> DOUBLE BOOKING! ❌
    //
    // TODO: Replace checkAvailability + create with Prisma Transaction + Lock
    // This ensures atomicity (check + create as single operation)
    //
    // SOLUTION - Use Prisma Interactive Transaction with SELECT FOR UPDATE:
    //
    // return await prisma.$transaction(async (tx) => {
    //   // STEP 1: LOCK the property row (prevents concurrent modifications)
    //   // This blocks other transactions from reading/writing this property
    //   await tx.$executeRaw`
    //     SELECT 1 FROM "Property"
    //     WHERE id = ${propertyId}
    //     FOR UPDATE
    //   `;
    //
    //   // STEP 2: Check availability (within transaction, after lock acquired)
    //   const overlappingBookings = await tx.booking.count({
    //     where: {
    //       propertyId,
    //       status: { in: ['PENDING', 'CONFIRMED'] },
    //       OR: [
    //         { checkIn: { lte: checkIn }, checkOut: { gt: checkIn } },
    //         { checkIn: { lt: checkOut }, checkOut: { gte: checkOut } },
    //         { checkIn: { gte: checkIn }, checkOut: { lte: checkOut } }
    //       ]
    //     }
    //   });
    //
    //   if (overlappingBookings > 0) {
    //     throw new AppError(409, 'Property not available for selected dates');
    //   }
    //
    //   // STEP 3: Check blocked dates
    //   const blockedDates = await tx.blockedDate.count({
    //     where: {
    //       propertyId,
    //       OR: [
    //         { startDate: { lte: checkIn }, endDate: { gt: checkIn } },
    //         { startDate: { lt: checkOut }, endDate: { gte: checkOut } },
    //         { startDate: { gte: checkIn }, endDate: { lte: checkOut } }
    //       ]
    //     }
    //   });
    //
    //   if (blockedDates > 0) {
    //     throw new AppError(409, 'Property blocked for selected dates');
    //   }
    //
    //   // STEP 4: Create booking (still within locked transaction)
    //   const booking = await tx.booking.create({
    //     data: {
    //       propertyId,
    //       userId,
    //       checkIn,
    //       checkOut,
    //       guests,
    //       totalPrice,
    //       status: 'PENDING' // Requires payment confirmation
    //     },
    //     include: { property: true }
    //   });
    //
    //   return booking;
    //
    // }, {
    //   isolationLevel: 'Serializable', // Highest isolation level
    //   maxWait: 5000,  // Wait max 5s to acquire lock
    //   timeout: 10000  // Transaction timeout 10s
    // });
    //
    // Why this works:
    // - SELECT FOR UPDATE acquires exclusive row lock on Property
    // - Other concurrent bookings WAIT for lock to be released
    // - Only ONE transaction proceeds at a time per property
    // - Prevents race condition completely! ✅

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

    // TODO: After booking created successfully, trigger background jobs
    // IMPORTANT: Do NOT send emails synchronously (blocks HTTP response)
    //
    // await emailQueue.add('booking-confirmation', {
    //   bookingId: booking.id,
    //   userId,
    //   userEmail: user.email,
    //   propertyTitle: property.title,
    //   checkIn,
    //   checkOut,
    //   totalPrice
    // }, {
    //   attempts: 3,
    //   backoff: { type: 'exponential', delay: 2000 }
    // });
    //
    // await pdfQueue.add('generate-booking-receipt', {
    //   bookingId: booking.id
    // });
    //
    // These jobs run in separate worker processes:
    // - workers/email.worker.ts (handles email sending)
    // - workers/pdf.worker.ts (generates PDF receipts)
    //
    // Why use BullMQ:
    // 1. Non-blocking: HTTP response returns immediately
    // 2. Retry logic: Automatic retries on failure
    // 3. Scalability: Can run workers on separate servers
    // 4. Monitoring: Built-in UI for job tracking

    // TODO: Add structured logging for analytics
    // logger.info({
    //   event: 'booking_created',
    //   bookingId: booking.id,
    //   userId,
    //   propertyId,
    //   checkIn: checkIn.toISOString(),
    //   checkOut: checkOut.toISOString(),
    //   nights,
    //   totalPrice,
    //   guests
    // }, 'New booking created');

    // TODO: Write integration test for race condition
    // Test scenario: Spawn 10 concurrent requests to book same dates
    // Expected: Only 1 succeeds with 201, others fail with 409 Conflict
    // Currently: Multiple bookings succeed = BUG! ❌
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

    // TODO: Check if already cancelled (idempotency)
    // if (booking.status === 'CANCELLED') {
    //   return; // Already cancelled, return success (idempotent)
    // }

    // TODO: Implement cancellation policy with refund calculation
    // Policy:
    // - Cancel >48h before check-in: 100% refund
    // - Cancel 24h-48h before: 50% refund
    // - Cancel <24h before: No refund
    // - Host cancellation: Always full refund + penalty to host
    //
    // const now = new Date();
    // const hoursUntilCheckIn = (booking.checkIn.getTime() - now.getTime()) / (1000 * 60 * 60);
    //
    // let refundPercentage = 0;
    // if (hoursUntilCheckIn >= 48) {
    //   refundPercentage = 100;
    // } else if (hoursUntilCheckIn >= 24) {
    //   refundPercentage = 50;
    // }
    //
    // const refundAmount = (booking.totalPrice * refundPercentage) / 100;

    // TODO: Use transaction to update booking + create refund payment
    // await prisma.$transaction([
    //   prisma.booking.update({
    //     where: { id },
    //     data: {
    //       status: 'CANCELLED',
    //       cancelledAt: new Date()
    //     }
    //   }),
    //   // If refund > 0, create refund payment record
    //   ...(refundAmount > 0 ? [
    //     prisma.payment.create({
    //       data: {
    //         bookingId: id,
    //         amount: -refundAmount, // Negative = refund
    //         method: booking.payment?.method || 'CARD',
    //         status: 'REFUNDED',
    //         processedAt: new Date()
    //       }
    //     })
    //   ] : [])
    // ]);

    await prisma.booking.update({
      where: { id },
      data: { status: "CANCELLED" },
    });

    // TODO: Trigger background job to process actual refund via payment provider
    // This should NOT be done synchronously (can take 3-5 seconds)
    //
    // if (refundAmount > 0) {
    //   await emailQueue.add('process-refund', {
    //     bookingId: id,
    //     paymentId: booking.payment?.id,
    //     refundAmount,
    //     reason: 'Guest cancellation'
    //   }, {
    //     attempts: 5, // Refunds are critical, retry more
    //     backoff: { type: 'exponential', delay: 5000 }
    //   });
    // }

    // TODO: Send cancellation emails to guest AND host
    // await emailQueue.add('booking-cancelled', {
    //   bookingId: id,
    //   recipientType: 'both', // Send to guest and host
    //   refundAmount,
    //   cancellationPolicy: `${refundPercentage}% refund`
    // });

    // TODO: Log cancellation with business context
    // logger.info({
    //   event: 'booking_cancelled',
    //   bookingId: id,
    //   userId,
    //   hoursBeforeCheckIn: hoursUntilCheckIn,
    //   refundAmount,
    //   refundPercentage
    // }, 'Booking cancelled by guest');

    // TODO: Write test for cancellation policy
    // Test cases:
    // - Cancel 72h before -> 100% refund
    // - Cancel 36h before -> 50% refund
    // - Cancel 12h before -> 0% refund
    // - Cancel already completed booking -> 400 error
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
        OR: [
          { checkIn: { lte: checkIn }, checkOut: { gt: checkIn } },
          { checkIn: { lt: checkOut }, checkOut: { gte: checkOut } },
          { checkIn: { gte: checkIn }, checkOut: { lte: checkOut } },
        ],
      },
    });

    if (overlappingBookings > 0) return false;

    // Check for blocked dates
    const blockedDates = await prisma.blockedDate.count({
      where: {
        propertyId,
        OR: [
          { startDate: { lte: checkIn }, endDate: { gt: checkIn } },
          { startDate: { lt: checkOut }, endDate: { gte: checkOut } },
          { startDate: { gte: checkIn }, endDate: { lte: checkOut } },
        ],
      },
    });

    return blockedDates === 0;
  }
}
