import { z } from "zod";

// TODO: Strengthen password validation for better security
// Current: min 8 characters (weak!)
// Recommended requirements:
// - Min 8 characters (or 12 for better security)
// - At least 1 uppercase letter
// - At least 1 lowercase letter
// - At least 1 number
// - At least 1 special character
// - No common passwords (use zxcvbn library for password strength)
//
// Example strong password schema:
// password: z.string()
//   .min(12, 'Password must be at least 12 characters')
//   .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
//   .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
//   .regex(/[0-9]/, 'Password must contain at least one number')
//   .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character')
//   .refine((val) => !commonPasswords.includes(val), {
//     message: 'Password is too common'
//   })

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  // TODO: Add optional fields
  // phoneNumber: z.string().regex(/^\+?[1-9]\d{1,14}$/).optional(),
  // dateOfBirth: z.string().datetime().transform(s => new Date(s)).optional(),
  // agreedToTerms: z.boolean().refine(val => val === true, {
  //   message: 'You must accept the terms and conditions'
  // })
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
  // TODO: Add optional remember-me flag
  // rememberMe: z.boolean().optional().default(false)
  // If true, issue longer-lived refresh token (30 days vs 7 days)
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string(),
  // TODO: Change to extract from HttpOnly cookie instead of body
  // This schema becomes unnecessary once cookies are used
  // Validation happens in middleware: const token = req.cookies.refreshToken
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
