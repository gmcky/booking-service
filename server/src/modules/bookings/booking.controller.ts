import type { Request, Response } from "express";
import type { AuthenticatedRequest } from "../../shared/types/index.js";
import { getIdParam } from "../../shared/utils/request.helpers.js";
import { BookingService } from "./booking.service.js";
import { logger } from "../../shared/lib/logger.js";

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
  const userRole = req.user!.role;
  const booking = await BookingService.getById(id, userId, userRole);
  res.json(booking);
}

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

export async function updateBookingStatus(
  req: AuthenticatedRequest,
  res: Response,
) {
  const id = getIdParam(req);
  const userId = req.user!.id;
  const userRole = req.user!.role;
  const { status } = req.body;
  const booking = await BookingService.updateStatus(
    id,
    userId,
    userRole,
    status,
  );
  res.json(booking);
}

export async function cancelBooking(req: AuthenticatedRequest, res: Response) {
  const id = getIdParam(req);
  const userId = req.user!.id;
  const userRole = req.user!.role;
  await BookingService.cancel(id, userId, userRole);
  res.status(204).send();
}

export async function updateBookingDates(
  req: AuthenticatedRequest,
  res: Response,
) {
  const id = getIdParam(req);
  const userId = req.user!.id;
  const userRole = req.user!.role;
  const booking = await BookingService.updateDates(
    id,
    userId,
    userRole,
    req.body,
  );
  res.json(booking);
}

// Public endpoints.

export async function checkAvailability(req: Request, res: Response) {
  const { propertyId, checkIn, checkOut } = req.body;

  const isAvailable = await BookingService.checkAvailability(
    propertyId,
    checkIn,
    checkOut,
  );

  res.json({ available: isAvailable });
}

export async function getBlockedDates(req: Request, res: Response) {
  const propertyId = getIdParam(req, "propertyId");
  const result = await BookingService.getBlockedDates(propertyId);
  res.json(result);
}
