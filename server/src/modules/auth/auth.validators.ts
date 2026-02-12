import { z } from "zod";
import zxcvbn from "zxcvbn";
import { parsePhoneNumberWithError, PhoneNumber } from "libphonenumber-js";

export const registerSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z
    .string()
    .min(8)
    .max(128)
    .refine(
      (password) => {
        const result = zxcvbn(password);
        return result.score >= 3;
      },
      {
        message:
          "Password is too weak or common. Please use a stronger password.",
      },
    ),
  firstName: z.string().min(1),
  lastName: z.string().min(1),

  phoneNumber: z
    .string()
    .min(10)
    .max(20)
    .optional()
    .refine(
      (val) => {
        if (!val) return true;
        try {
          const phoneNumber = parsePhoneNumberWithError(val, "UA");
          return phoneNumber.isValid();
        } catch {
          return false;
        }
      },
      {
        message: "Invalid phone number format",
      },
    ),
});

export const loginSchema = z.object({
  email: z.email().trim().toLowerCase(),
  password: z.string().min(1, "Password is required"),
  rememberMe: z.boolean().optional().default(false),
});

export const refreshTokenSchema = z.object({
  refreshToken: z
    .string()
    .trim()
    .min(20, "Refresh token is required")
    .max(2048, "Refresh token is too long")
    .regex(/^[^\s]+$/, "Refresh token must not contain whitespace"),
  // TODO: Move refresh token to HttpOnly cookie + middleware validation/rotation
});

// TODO: Add validation schemas for other auth endpoints
// export const passwordResetRequestSchema = z.object({
//   email: z.string().email()
// });
//
// export const passwordResetSchema = z.object({
//   token: z.string().min(32),
//   newPassword: z.string().min(12) // Same strong password rules
// });
//
// export const changePasswordSchema = z.object({
//   currentPassword: z.string(),
//   newPassword: z.string().min(12),
//   confirmPassword: z.string()
// }).refine((data) => data.newPassword === data.confirmPassword, {
//   message: "Passwords don't match",
//   path: ['confirmPassword']
// });
