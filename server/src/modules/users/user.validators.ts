import { z } from "zod";

/**
 * Schema for general profile updates.
 * Email is intentionally excluded — use the dedicated email-change flow instead.
 */
export const updateUserSchema = z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
});

/**
 * Step 1: Request an email change.
 * Sends an OTP to the NEW email for verification.
 */
export const requestEmailChangeSchema = z.object({
  newEmail: z.string().email(),
});

/**
 * Step 2: Confirm the email change with the OTP received by the new email.
 */
export const confirmEmailChangeSchema = z.object({
  otp: z
    .string()
    .length(6)
    .regex(/^\d{6}$/, "OTP must be 6 digits"),
});
