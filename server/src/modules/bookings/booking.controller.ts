import type { Request, Response } from "express";
import type { AuthenticatedRequest } from "../../shared/types/index.js";
import { getIdParam } from "../../shared/utils/request.helpers.js";
import { BookingService } from "./booking.service.js";
import { HostCancellationService } from "./host-cancel.service.js";
import { logger } from "../../shared/lib/logger.js";
import type { HostBookingsQueryInput } from "./booking.types.js";

/**
 * @server\src\api.routes.ts
 * @route GET /api/v1/bookings
 * @access Private
 * @security Bearer token required.
 */
export async function getUserBookings(req: AuthenticatedRequest, res: Response) {
  const userId = req.user!.id;
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 10;

  const result = await BookingService.getUserBookings(userId, { page, limit });
  res.json(result);
}

/**
 * @server\src\api.routes.ts
 * @route GET /api/v1/bookings/host
 * @access Private
 * @security Bearer token required.
 */
export async function getHostBookings(req: AuthenticatedRequest, res: Response) {
  const ownerId = req.user!.id;
  const { page, limit, status, propertyId } = req.query as unknown as HostBookingsQueryInput;

  const result = await BookingService.getHostBookings(
    ownerId,
    { page, limit },
    { status, propertyId },
  );
  res.json(result);
}

/**
 * @server\src\api.routes.ts
 * @route GET /api/v1/bookings/:id
 * @access Private
 * @security Bearer token required.
 */
export async function getBookingById(req: AuthenticatedRequest, res: Response) {
  const id = getIdParam(req);
  const userId = req.user!.id;
  const userRole = req.user!.role;
  const booking = await BookingService.getById(id, userId, userRole);
  res.json(booking);
}

/**
 * @server\src\api.routes.ts
 * @route GET /api/v1/bookings/:id/host-view
 * @access Private
 * @security Bearer token required. Property owner only.
 */
export async function getHostBookingById(req: AuthenticatedRequest, res: Response) {
  const id = getIdParam(req);
  const ownerId = req.user!.id;
  const booking = await BookingService.getHostBookingById(id, ownerId);
  res.json(booking);
}

/**
 * @server\src\api.routes.ts
 * @route POST /api/v1/bookings/:id/host-cancel-request
 * @access Private
 * @security Bearer token required. Property owner only.
 */
export async function requestHostCancellation(req: AuthenticatedRequest, res: Response) {
  const id = getIdParam(req);
  const hostUserId = req.user!.id;
  const { reason } = req.body;
  const request = await HostCancellationService.requestCancellation(id, hostUserId, reason);
  res.status(201).json(request);
}

/**
 * @server\src\api.routes.ts
 * @route POST /api/v1/bookings/:id/host-decline
 * @access Private
 * @security Bearer token required. Property owner only.
 */
export async function declineHostBooking(req: AuthenticatedRequest, res: Response) {
  const id = getIdParam(req);
  const hostUserId = req.user!.id;
  const booking = await HostCancellationService.declinePending(id, hostUserId);
  res.json(booking);
}

/**
 * @server\src\api.routes.ts
 * @route POST /api/v1/bookings
 * @access Private
 * @security Bearer token required.
 */
export async function createBooking(req: AuthenticatedRequest, res: Response) {
  const userId = req.user!.id;

  logger.debug(
    {
      userId,
      propertyId: req.body.propertyId,
      checkIn: req.body.checkIn,
      checkOut: req.body.checkOut,
    },
    "Attempting to create booking",
  );

  const booking = await BookingService.create({ ...req.body, userId });

  logger.info(
    {
      event: "booking_created",
      bookingId: booking.id,
      userId,
      propertyId: booking.propertyId,
      totalPrice: Number(booking.totalPrice),
    },
    "Booking created",
  );

  res.status(201).json(booking);
}

/**
 * @server\src\api.routes.ts
 * @route PATCH /api/v1/bookings/:id/status
 * @access Private
 * @security Bearer token required.
 */
export async function updateBookingStatus(req: AuthenticatedRequest, res: Response) {
  const id = getIdParam(req);
  const userId = req.user!.id;
  const userRole = req.user!.role;
  const { status } = req.body;
  const booking = await BookingService.updateStatus(id, userId, userRole, status);
  res.json(booking);
}

/**
 * @server\src\api.routes.ts
 * @route DELETE /api/v1/bookings/:id
 * @access Private
 * @security Bearer token required.
 */
export async function cancelBooking(req: AuthenticatedRequest, res: Response) {
  const id = getIdParam(req);
  const userId = req.user!.id;
  const userRole = req.user!.role;
  const result = await BookingService.cancel(id, userId, userRole);
  res.json(result);
}

/**
 * @server\src\api.routes.ts
 * @route POST /api/v1/bookings/:id/early-checkout
 * @access Private
 * @security Bearer token required. Guest or admin only.
 */
export async function earlyCheckout(req: AuthenticatedRequest, res: Response) {
  const id = getIdParam(req);
  const userId = req.user!.id;
  const userRole = req.user!.role;
  const booking = await BookingService.earlyCheckout(id, userId, userRole);
  res.json(booking);
}

/**
 * @server\src\api.routes.ts
 * @route PATCH /api/v1/bookings/:id/dates
 * @access Private
 * @security Bearer token required.
 */
export async function updateBookingDates(req: AuthenticatedRequest, res: Response) {
  const id = getIdParam(req);
  const userId = req.user!.id;
  const userRole = req.user!.role;
  const booking = await BookingService.updateDates(id, userId, userRole, req.body);
  res.json(booking);
}

/**
 * @server\src\api.routes.ts
 * @route POST /api/v1/bookings/check-availability
 * @access Public
 */
export async function checkAvailability(req: Request, res: Response) {
  const { propertyId, checkIn, checkOut } = req.body;

  const isAvailable = await BookingService.checkAvailability(propertyId, checkIn, checkOut);

  res.json({ available: isAvailable });
}

/**
 * @server\src\api.routes.ts
 * @route GET /api/v1/bookings/:propertyId/blocked-dates
 * @access Public
 */
export async function getBlockedDates(req: Request, res: Response) {
  const propertyId = getIdParam(req, "propertyId");
  const result = await BookingService.getBlockedDates(propertyId);
  res.json(result);
}
