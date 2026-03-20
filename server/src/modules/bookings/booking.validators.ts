import { z } from "zod";
import { sanitizeString } from "../../shared/utils/sanitize.js";

const HH_MM_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;

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
    specialRequests: z
      .string()
      .trim()
      .max(500)
      .transform(sanitizeString)
      .optional(),
    arrivalTime: z
      .string()
      .regex(HH_MM_REGEX, "Expected HH:mm format")
      .optional(),
  })
  .refine((data) => data.checkOut > data.checkIn, {
    message: "Check-out must be after check-in",
    path: ["checkOut"],
  })
  .refine((data) => data.checkIn > new Date(), {
    message: "Check-in date must be in the future",
    path: ["checkIn"],
  })
  .refine(
    (data) => {
      const nights = Math.ceil(
        (data.checkOut.getTime() - data.checkIn.getTime()) /
          (1000 * 60 * 60 * 24),
      );
      return nights >= 1;
    },
    {
      message: "Minimum stay is 1 night",
      path: ["checkOut"],
    },
  )
  .refine(
    (data) => {
      const nights = Math.ceil(
        (data.checkOut.getTime() - data.checkIn.getTime()) /
          (1000 * 60 * 60 * 24),
      );
      return nights <= 90;
    },
    {
      message: "Maximum stay is 90 nights",
      path: ["checkOut"],
    },
  )
  .refine(
    (data) => {
      const oneYearFromNow = new Date();
      oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1);
      return data.checkIn <= oneYearFromNow;
    },
    {
      message: "Cannot book more than 1 year in advance",
      path: ["checkIn"],
    },
  );

export const updateBookingStatusSchema = z.object({
  status: z.enum(["PENDING", "CONFIRMED", "CANCELLED", "COMPLETED"]),
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
