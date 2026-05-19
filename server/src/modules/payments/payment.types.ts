import type { z } from "zod";
import type {
  createPaymentSchema,
  createPaymentIntentSchema,
  requestRefundSchema,
  rejectRefundSchema,
} from "./payment.validators.js";

export type CreatePaymentInput = z.infer<typeof createPaymentSchema>;
export type CreatePaymentIntentInput = z.infer<typeof createPaymentIntentSchema>;
export type RequestRefundInput = z.infer<typeof requestRefundSchema>;
export type RejectRefundInput = z.infer<typeof rejectRefundSchema>;
