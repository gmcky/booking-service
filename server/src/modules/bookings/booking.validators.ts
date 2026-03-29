import { z } from "zod";
import { calculateNights } from "../../shared/utils/date.helpers.js";
import {
  MAX_BOOKING_ADVANCE_YEARS,
  MAX_STAY_NIGHTS,
  MIN_ADVANCE_HOURS,
} from "./booking.constants.js";

export const createBookingSchema = z
  .object({
    propertyId: z.string().uuid(),
    checkIn: z
      .string()
      .datetime()
      .transform((val) => new Date(val)),
    checkOut: z
      .string()
      .datetime()
      .transform((val) => new Date(val)),
    guests: z.number().int().positive(),
  })
  .refine((data) => data.checkOut > data.checkIn, {
    message: "Check-out must be after check-in",
    path: ["checkOut"],
  })
  .refine(
    (data) =>
      data.checkIn.getTime() >=
      Date.now() + MIN_ADVANCE_HOURS * 60 * 60 * 1000,
    {
      message: `Check-in must be at least ${MIN_ADVANCE_HOURS} hours from now`,
      path: ["checkIn"],
    },
  )
  .refine((data) => calculateNights(data.checkIn, data.checkOut) >= 1, {
    message: "Minimum stay is 1 night",
    path: ["checkOut"],
  })
  .refine((data) => calculateNights(data.checkIn, data.checkOut) <= MAX_STAY_NIGHTS, {
    message: `Maximum stay is ${MAX_STAY_NIGHTS} nights`,
    path: ["checkOut"],
  })
  .refine(
    (data) => {
      const oneYearFromNow = new Date();
      oneYearFromNow.setFullYear(
        oneYearFromNow.getFullYear() + MAX_BOOKING_ADVANCE_YEARS,
      );
      return data.checkIn <= oneYearFromNow;
    },
    {
      message: "Cannot book more than 1 year in advance",
      path: ["checkIn"],
    },
  );

export const updateBookingStatusSchema = z.object({
  status: z.enum(["CONFIRMED", "COMPLETED"]),
});

export const availabilitySchema = z
  .object({
    propertyId: z.string().uuid(),
    checkIn: z
      .string()
      .datetime()
      .transform((s) => new Date(s)),
    checkOut: z
      .string()
      .datetime()
      .transform((s) => new Date(s)),
  })
  .refine((data) => data.checkOut > data.checkIn, {
    message: "Invalid date range",
  });

export const updateBookingDatesSchema = z
  .object({
    checkIn: z
      .string()
      .datetime()
      .transform((s) => new Date(s))
      .optional(),
    checkOut: z
      .string()
      .datetime()
      .transform((s) => new Date(s))
      .optional(),
    guests: z.number().int().positive().optional(),
  })
  .refine(
    (data) => {
      if (data.checkIn && data.checkOut) {
        return data.checkOut > data.checkIn;
      }
      return true;
    },
    {
      message: "Check-out must be after check-in",
    },
  );
