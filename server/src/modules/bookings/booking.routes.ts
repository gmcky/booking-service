import { Router, type IRouter } from "express";
import { authenticate } from "../../shared/middlewares/auth.js";
import { validate } from "../../shared/middlewares/validate.js";
import { asyncHandler } from "../../shared/utils/async.handler.js";
import * as bookingController from "./booking.controller.js";
import {
  createBookingSchema,
  updateBookingStatusSchema,
} from "./booking.validators.js";

export const bookingRouter: IRouter = Router();

// All routes require authentication
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

bookingRouter.delete("/:id", asyncHandler(bookingController.cancelBooking));

// Check property availability
bookingRouter.post(
  "/check-availability",
  asyncHandler(bookingController.checkAvailability),
);
