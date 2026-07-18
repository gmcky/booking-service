import { Router, type IRouter } from "express";
import { authenticate, requireVerifiedEmail } from "../../shared/middlewares/auth.js";
import { validate } from "../../shared/middlewares/validate.js";
import { asyncHandler } from "../../shared/utils/async.handler.js";
import * as bookingController from "./booking.controller.js";
import {
  createBookingSchema,
  updateBookingStatusSchema,
  availabilitySchema,
  updateBookingDatesSchema,
  hostBookingsQuerySchema,
  hostCancelRequestSchema,
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
 *       200:
 *         description: Availability result
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 available: { type: boolean }
 *               required: [available]
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
 *       200:
 *         description: Blocked date list
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/BlockedDates'
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
 *       200:
 *         description: User booking list
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items: { $ref: '#/components/schemas/BookingListItem' }
 *                 pagination:
 *                   $ref: '#/components/schemas/Pagination'
 *               required: [data, pagination]
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
 *       200:
 *         description: Host booking list
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items: { $ref: '#/components/schemas/HostBooking' }
 *                 pagination:
 *                   $ref: '#/components/schemas/Pagination'
 *               required: [data, pagination]
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
 *       200:
 *         description: Booking detail
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/BookingDetail'
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
bookingRouter.get("/:id", asyncHandler(bookingController.getBookingById));

/**
 * @openapi
 * /bookings/{id}/host-view:
 *   get:
 *     tags: [Bookings]
 *     summary: Get booking by id from the host's perspective (owner only)
 *     description: Guest email/phone are only included once the booking is CONFIRMED or COMPLETED.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200:
 *         description: Host booking detail
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/HostBookingDetail' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
bookingRouter.get("/:id/host-view", asyncHandler(bookingController.getHostBookingById));

/**
 * @openapi
 * /bookings/{id}/host-cancel-request:
 *   post:
 *     tags: [Bookings]
 *     summary: Host requests cancellation of a confirmed booking (admin-approved)
 *     description: Only the property owner may file this. Approval issues a full refund to the guest.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [reason]
 *             properties:
 *               reason: { type: string, minLength: 10, maxLength: 1000 }
 *     responses:
 *       201:
 *         description: Cancellation request created
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/HostCancellationRequest' }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       409: { description: A request is already pending for this booking }
 */
bookingRouter.post(
  "/:id/host-cancel-request",
  validate(hostCancelRequestSchema),
  asyncHandler(bookingController.requestHostCancellation),
);

/**
 * @openapi
 * /bookings/{id}/host-decline:
 *   post:
 *     tags: [Bookings]
 *     summary: Host declines a pending reservation (instant, full refund)
 *     description: >
 *       Only the property owner may decline, and only while the booking is PENDING.
 *       No admin approval — nothing was committed. A paid guest is refunded in full.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200:
 *         description: Reservation declined and cancelled
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Booking' }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
bookingRouter.post("/:id/host-decline", asyncHandler(bookingController.declineHostBooking));

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
 *       201:
 *         description: Booking created (PENDING)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/BookingWithProperty'
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { description: 'Email not verified (code: EMAIL_NOT_VERIFIED)' }
 *       409: { description: Date range conflict, or duplicate unpaid booking for the same stay }
 *       429: { description: Refund-velocity limit reached (too many recently refunded cancellations) }
 */
bookingRouter.post(
  "/",
  requireVerifiedEmail,
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
 *       200:
 *         description: Booking status updated
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Booking'
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
 *       200:
 *         description: Booking dates updated
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/BookingWithProperty'
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
 *       200:
 *         description: Early checkout recorded
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Booking'
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
 *       200:
 *         description: Booking cancelled
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 booking:
 *                   allOf:
 *                     - $ref: '#/components/schemas/Booking'
 *                     - type: object
 *                       properties:
 *                         property:
 *                           $ref: '#/components/schemas/Property'
 *                       required: [property]
 *                 cancellation:
 *                   type: object
 *                   nullable: true
 *                   properties:
 *                     refundPercent: { type: number }
 *                     refundAmount: { type: number }
 *                     hoursUntilCheckIn: { type: number }
 *                     policy:
 *                       type: object
 *                       properties:
 *                         fullRefundAfterHours: { type: number }
 *                         partialRefundAfterHours: { type: number }
 *                         partialRefundPercent: { type: number }
 *                       required: [fullRefundAfterHours, partialRefundAfterHours, partialRefundPercent]
 *                   required: [refundPercent, refundAmount, hoursUntilCheckIn, policy]
 *               required: [booking, cancellation]
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
bookingRouter.delete("/:id", asyncHandler(bookingController.cancelBooking));
