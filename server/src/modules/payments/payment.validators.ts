import { z } from "zod";

export const createPaymentSchema = z.object({
  bookingId: z.string().uuid(),
  provider: z.enum(["STRIPE", "PAYPAL", "CASH"]),
  currency: z.string().length(3).default("USD"),
});
