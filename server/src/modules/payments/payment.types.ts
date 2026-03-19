import type { z } from "zod";
import type {
  createPaymentSchema,
  createPaymentIntentSchema,
} from "./payment.validators.js";

export type CreatePaymentInput = z.infer<typeof createPaymentSchema>;
export type CreatePaymentIntentInput = z.infer<
  typeof createPaymentIntentSchema
>;
