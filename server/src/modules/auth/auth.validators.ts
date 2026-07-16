import { z } from "zod";
import zxcvbn from "zxcvbn";
import { isValidPhoneNumber } from "libphonenumber-js/min";

export const passwordSchema = z
  .string()
  .min(8)
  .max(128)
  .refine(
    (password) => {
      const result = zxcvbn(password);
      return result.score >= 3;
    },
    {
      message: "Password is too weak or common. Please use a stronger password.",
    },
  );

export const registerSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: passwordSchema,
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
        return isValidPhoneNumber(val);
      },
      {
        message: "Invalid phone number format",
      },
    ),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1, "Password is required"),
});

export const verifyEmailSchema = z.object({
  token: z.string().min(1, "Token is required"),
});

export const forgotPasswordSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1, "Token is required"),
  newPassword: passwordSchema,
});

export const googleAuthSchema = z.object({
  credential: z.string().min(1, "Credential is required"),
});
