import type { Request, Response } from "express";
import type { AuthenticatedRequest } from "../../shared/types/index.js";
import { getIdParam } from "../../shared/utils/request.helpers.js";
import { BookingService } from "./booking.service.js";
import { logger } from "../../shared/lib/logger.js";

// TODO: Add rate limiting to prevent booking spam
// Use express-rate-limit middleware on routes:
// - createBooking: 10 requests per hour per user
// - checkAvailability: 100 requests per 15 min per IP (public endpoint)
//
// import rateLimit from 'express-rate-limit';
// export const bookingRateLimit = rateLimit({
//   windowMs: 60 * 60 * 1000, // 1 hour
//   max: 10,
//   message: 'Too many booking attempts, try again later'
// });

/**
 * Get all bookings for authenticated user
 * @route GET /api/v1/bookings?page=1&limit=10
 * @access Private
 */

export async function getUserBookings(
  req: AuthenticatedRequest,
  res: Response,
) {
  const userId = req.user!.id;
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 10;

  const result = await BookingService.getUserBookings(userId, { page, limit });
  res.json(result);
}

export async function getBookingById(req: AuthenticatedRequest, res: Response) {
  const id = getIdParam(req);
  const userId = req.user!.id;
  const booking = await BookingService.getById(id, userId);
  res.json(booking);
}

export async function createBooking(req: AuthenticatedRequest, res: Response) {
  // TODO: Validate request body with Zod schema (add to route middleware)
  // Schema should validate:
  // - propertyId: UUID format
  // - checkIn/checkOut: ISO date strings, parse to Date objects
  // - guests: positive integer, max reasonable value (e.g., 50)
  //
  // Example Zod schema in booking.validators.ts:
  // export const createBookingSchema = z.object({
  //   body: z.object({
  //     propertyId: z.string().uuid(),
  //     checkIn: z.string().datetime().transform(s => new Date(s)),
  //     checkOut: z.string().datetime().transform(s => new Date(s)),
  //     guests: z.number().int().positive().max(50)
  //   })
  // });

  const userId = req.user!.id;

  // TODO: Add request logging (helps debug issues)
  // logger.debug({
  //   userId,
  //   propertyId: req.body.propertyId,
  //   checkIn: req.body.checkIn,
  //   checkOut: req.body.checkOut
  // }, 'Attempting to create booking');

  const booking = await BookingService.create({ ...req.body, userId });

  // TODO: Log successful booking creation (for analytics/monitoring)
  // logger.info({
  //   event: 'booking_created',
  //   bookingId: booking.id,
  //   userId,
  //   propertyId: booking.propertyId,
  //   totalPrice: booking.totalPrice
  // }, 'Booking created successfully');

  res.status(201).json(booking);

  // TODO: Send real-time notification to property owner
  // Use WebSockets or Server-Sent Events (SSE) for instant notification
  // or push notification if mobile app exists
}

export async function updateBookingStatus(
  req: AuthenticatedRequest,
  res: Response,
) {
  const id = getIdParam(req);
  const userId = req.user!.id;
  const { status } = req.body;
  const booking = await BookingService.updateStatus(id, userId, status);
  res.json(booking);
}

export async function cancelBooking(req: AuthenticatedRequest, res: Response) {
  const id = getIdParam(req);
  const userId = req.user!.id;
  await BookingService.cancel(id, userId);
  res.status(204).send();
}

export async function checkAvailability(req: Request, res: Response) {
  // TODO: Validate query parameters with Zod
  // const { propertyId, checkIn, checkOut } = validateQuery(req.query, availabilitySchema);

  const { propertyId, checkIn, checkOut } = req.body;

  // TODO: Parse and validate dates
  // const checkInDate = new Date(checkIn);
  // const checkOutDate = new Date(checkOut);
  // if (isNaN(checkInDate.getTime())) throw new AppError(400, 'Invalid checkIn date');
  // if (checkOutDate <= checkInDate) throw new AppError(400, 'checkOut must be after checkIn');

  const isAvailable = await BookingService.checkAvailability(
    propertyId,
    new Date(checkIn),
    new Date(checkOut),
  );

  // TODO: Cache this response in Redis (5 minute TTL)
  // Availability doesn't change frequently, caching reduces DB load
  //
  // import { redis } from '../../shared/lib/redis.js';
  // const cacheKey = `availability:${propertyId}:${checkIn}:${checkOut}`;
  // await redis.setex(cacheKey, 300, JSON.stringify({ available: isAvailable }));
  //
  // Before querying DB, check cache first:
  // const cached = await redis.get(cacheKey);
  // if (cached) return res.json(JSON.parse(cached));

  // TODO: Return more detailed availability info
  // Instead of just true/false, return:
  // {
  //   available: boolean,
  //   unavailableDates: Date[], // Array of booked dates for calendar UI
  //   nextAvailableDate?: Date,  // Suggest alternative
  //   reason?: string            // "booked" | "blocked" | "past"
  // }

  res.json({ available: isAvailable });
}
