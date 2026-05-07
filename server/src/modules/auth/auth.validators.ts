import { z } from "zod";
import zxcvbn from "zxcvbn";
import { isValidPhoneNumber } from "libphonenumber-js/min";

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

// TODO: add reset/change-password schemas.
