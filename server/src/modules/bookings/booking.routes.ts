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
} from "./booking.validators.js";

export const bookingRouter: IRouter = Router();

bookingRouter.post(
  "/check-availability",
  validate(availabilitySchema),
  asyncHandler(bookingController.checkAvailability),
);

// TODO: move blocked-dates route under /properties.
bookingRouter.get(
  "/:propertyId/blocked-dates",
  asyncHandler(bookingController.getBlockedDates),
);

bookingRouter.use(authenticate);

bookingRouter.get("/", asyncHandler(bookingController.getUserBookings));

bookingRouter.get("/:id", asyncHandler(bookingController.getBookingById));

bookingRouter.post(
  "/",
  validate(createBookingSchema),
  asyncHandler(bookingController.createBooking),
);

bookingRouter.patch(
  "/:id/status",
  validate(updateBookingStatusSchema),
  asyncHandler(bookingController.updateBookingStatus),
);

bookingRouter.patch(
  "/:id/dates",
  validate(updateBookingDatesSchema),
  asyncHandler(bookingController.updateBookingDates),
);

bookingRouter.delete("/:id", asyncHandler(bookingController.cancelBooking));
