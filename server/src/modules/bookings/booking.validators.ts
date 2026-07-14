import { z } from "zod";
import prismaClientPkg from "@prisma/client";
const { BookingStatus } = prismaClientPkg;
import { calculateNights } from "../../shared/utils/date.helpers.js";
import { MAX_BOOKING_ADVANCE_YEARS, MAX_STAY_NIGHTS } from "./booking.constants.js";

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
  .refine((data) => data.checkIn.getTime() >= new Date().setUTCHours(0, 0, 0, 0), {
    message: "Check-in cannot be in the past",
    path: ["checkIn"],
  })
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
      oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + MAX_BOOKING_ADVANCE_YEARS);
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

export const hostCancelRequestSchema = z.object({
  reason: z.string().trim().min(10).max(1000),
});

export const hostBookingsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(10),
  status: z.nativeEnum(BookingStatus).optional(),
  propertyId: z.string().uuid().optional(),
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
