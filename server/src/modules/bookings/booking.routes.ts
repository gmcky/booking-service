import { Router, type IRouter } from "express";
import { authenticate } from "../../shared/middlewares/auth.js";
import { validate } from "../../shared/middlewares/validate.js";
import { asyncHandler } from "../../shared/utils/async.handler.js";
import * as bookingController from "./booking.controller.js";
import {
  createBookingSchema,
  updateBookingStatusSchema,
  availabilitySchema,
  updateBookingDatesSchema,
  hostBookingsQuerySchema,
} from "./booking.validators.js";

export const bookingRouter: IRouter = Router();

/**
 * @openapi
 * /bookings/check-availability:
 *   post:
 *     tags: [Bookings]
 *     summary: Check property availability for a date range
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [propertyId, checkIn, checkOut]
 *             properties:
 *               propertyId: { type: string, format: uuid }
 *               checkIn: { type: string, format: date-time }
 *               checkOut: { type: string, format: date-time }
 *     responses:
 *       200: { description: Availability result }
 *       400: { $ref: '#/components/responses/ValidationError' }
 */
bookingRouter.post(
  "/check-availability",
  validate(availabilitySchema),
  asyncHandler(bookingController.checkAvailability),
);

/**
 * @openapi
 * /bookings/{propertyId}/blocked-dates:
 *   get:
 *     tags: [Bookings]
 *     summary: List blocked date ranges for a property
 *     parameters:
 *       - { in: path, name: propertyId, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200: { description: Blocked date list }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
// TODO: move blocked-dates route under /properties.
bookingRouter.get("/:propertyId/blocked-dates", asyncHandler(bookingController.getBlockedDates));

bookingRouter.use(authenticate);

/**
 * @openapi
 * /bookings:
 *   get:
 *     tags: [Bookings]
 *     summary: List bookings owned by current user (guest or host)
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: User booking list }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
bookingRouter.get("/", asyncHandler(bookingController.getUserBookings));

/**
 * @openapi
 * /bookings/host:
 *   get:
 *     tags: [Bookings]
 *     summary: List bookings on properties owned by current user (host)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: query, name: page, schema: { type: integer, default: 1 } }
 *       - { in: query, name: limit, schema: { type: integer, default: 10, maximum: 100 } }
 *       - { in: query, name: status, schema: { type: string, enum: [PENDING, CONFIRMED, CANCELLED, COMPLETED] } }
 *       - { in: query, name: propertyId, schema: { type: string, format: uuid } }
 *     responses:
 *       200: { description: Host booking list }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
bookingRouter.get(
  "/host",
  validate(hostBookingsQuerySchema, "query"),
  asyncHandler(bookingController.getHostBookings),
);

/**
 * @openapi
 * /bookings/{id}:
 *   get:
 *     tags: [Bookings]
 *     summary: Get booking by id (guest or host only)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200: { description: Booking detail }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
bookingRouter.get("/:id", asyncHandler(bookingController.getBookingById));

/**
 * @openapi
 * /bookings:
 *   post:
 *     tags: [Bookings]
 *     summary: Create new booking (guest)
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [propertyId, checkIn, checkOut, guests]
 *             properties:
 *               propertyId: { type: string, format: uuid }
 *               checkIn: { type: string, format: date-time }
 *               checkOut: { type: string, format: date-time }
 *               guests: { type: integer, minimum: 1 }
 *     responses:
 *       201: { description: Booking created (PENDING) }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       409: { description: Date range conflict }
 */
bookingRouter.post(
  "/",
  validate(createBookingSchema),
  asyncHandler(bookingController.createBooking),
);

/**
 * @openapi
 * /bookings/{id}/status:
 *   patch:
 *     tags: [Bookings]
 *     summary: Update booking status (host confirm or system complete)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [status]
 *             properties:
 *               status: { type: string, enum: [CONFIRMED, COMPLETED] }
 *     responses:
 *       200: { description: Booking status updated }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
bookingRouter.patch(
  "/:id/status",
  validate(updateBookingStatusSchema),
  asyncHandler(bookingController.updateBookingStatus),
);

/**
 * @openapi
 * /bookings/{id}/dates:
 *   patch:
 *     tags: [Bookings]
 *     summary: Modify booking dates or guests (guest only, before check-in)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               checkIn: { type: string, format: date-time }
 *               checkOut: { type: string, format: date-time }
 *               guests: { type: integer, minimum: 1 }
 *     responses:
 *       200: { description: Booking dates updated }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       409: { description: Date range conflict }
 */
bookingRouter.patch(
  "/:id/dates",
  validate(updateBookingDatesSchema),
  asyncHandler(bookingController.updateBookingDates),
);

/**
 * @openapi
 * /bookings/{id}/early-checkout:
 *   post:
 *     tags: [Bookings]
 *     summary: Mark booking as early checkout (guest)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200: { description: Early checkout recorded }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
bookingRouter.post("/:id/early-checkout", asyncHandler(bookingController.earlyCheckout));

/**
 * @openapi
 * /bookings/{id}:
 *   delete:
 *     tags: [Bookings]
 *     summary: Cancel booking (guest or host depending on state)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200: { description: Booking cancelled }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
bookingRouter.delete("/:id", asyncHandler(bookingController.cancelBooking));
