import type { z } from "zod";
import type { createBookingSchema } from "./booking.validators.js";

export type CreateBookingInput = z.infer<typeof createBookingSchema> & {
  userId: string;
};
