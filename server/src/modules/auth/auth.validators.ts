import { z } from "zod";
import zxcvbn from "zxcvbn";
import { parsePhoneNumberWithError } from "libphonenumber-js";

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
});

// TODO: add reset/change-password schemas.
