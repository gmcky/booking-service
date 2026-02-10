import { z } from "zod";

// TODO: Add more business rule validations
// These validations provide immediate feedback to users
// before hitting the database (improves UX and reduces load)

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
    // TODO: Add optional fields
    // specialRequests: z.string().max(500).optional(),
    // arrivalTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/).optional()
  })
  .refine((data) => data.checkOut > data.checkIn, {
    message: "Check-out must be after check-in",
    path: ["checkOut"],
  })
  // TODO: Add validation - check-in must be in the future
  .refine((data) => data.checkIn > new Date(), {
    message: "Check-in date must be in the future",
    path: ["checkIn"],
  })
  // TODO: Add validation - minimum stay (1 night)
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
  // TODO: Add validation - maximum stay (e.g., 90 days)
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
  // TODO: Add validation - check-in not too far in future (e.g., 1 year)
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
  // TODO: Add validation for allowed status transitions
  // Example: PENDING -> CONFIRMED (after payment)
  //          PENDING/CONFIRMED -> CANCELLED (by user/host)
  //          CONFIRMED -> COMPLETED (auto after checkout date)
  // Prevent invalid transitions like CANCELLED -> CONFIRMED
});

// TODO: Add schema for availability check
// export const availabilitySchema = z.object({
//   propertyId: z.string().uuid(),
//   checkIn: z.string().datetime().transform(s => new Date(s)),
//   checkOut: z.string().datetime().transform(s => new Date(s))
// }).refine((data) => data.checkOut > data.checkIn, {
//   message: 'Invalid date range'
// });

// TODO: Add schema for updating booking dates (rebooking)
// export const updateBookingDatesSchema = z.object({
//   checkIn: z.string().datetime().transform(s => new Date(s)).optional(),
//   checkOut: z.string().datetime().transform(s => new Date(s)).optional(),
//   guests: z.number().int().positive().optional()
// }).refine((data) => {
//   if (data.checkIn && data.checkOut) {
//     return data.checkOut > data.checkIn;
//   }
//   return true;
// }, {
//   message: 'Check-out must be after check-in'
// });
