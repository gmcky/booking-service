import type { z } from "zod";
import type { createPaymentSchema } from "./payment.validators.js";

export type CreatePaymentInput = z.infer<typeof createPaymentSchema>;
