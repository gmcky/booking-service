import { z } from "zod";
import { sanitizeString } from "../../shared/utils/sanitize.js";

const sanitizedReasonSchema = z.string().trim().min(1).max(1000).transform(sanitizeString);

export const createPaymentSchema = z.object({
  bookingId: z.string().uuid(),
  provider: z.enum(["STRIPE"]),
  currency: z.string().length(3).default("USD"),
});

export const createPaymentIntentSchema = z.object({
  bookingId: z.string().uuid(),
});

export const requestRefundSchema = z.object({
  reason: sanitizedReasonSchema.optional(),
});

export const rejectRefundSchema = z.object({
  reason: sanitizedReasonSchema.optional(),
});
