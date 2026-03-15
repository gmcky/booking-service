import type { z } from "zod";
import type {
  createBookingSchema,
  availabilitySchema,
  updateBookingDatesSchema,
} from "./booking.validators.js";

export type CreateBookingInput = z.infer<typeof createBookingSchema> & {
  userId: string;
};

export type AvailabilityInput = z.infer<typeof availabilitySchema>;

export type UpdateBookingDatesInput = z.infer<typeof updateBookingDatesSchema>;
