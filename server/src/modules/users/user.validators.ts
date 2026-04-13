import { z } from "zod";

const PHONE_NUMBER_REGEX = /^\+?[1-9]\d{9,14}$/;
const PASSWORD_COMPLEXITY_REGEX =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).+$/;

function isAdult(dateOfBirth: Date): boolean {
  const now = new Date();
  const adultThreshold = new Date(
    now.getFullYear() - 18,
    now.getMonth(),
    now.getDate(),
  );

  return dateOfBirth <= adultThreshold;
}

/** Profile patch whitelist; email changes go through OTP flow. */
export const updateUserSchema = z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  phoneNumber: z
    .string()
    .trim()
    .regex(PHONE_NUMBER_REGEX, "Invalid phone number format")
    .optional(),
  dateOfBirth: z.coerce.date().refine(isAdult, {
    message: "You must be at least 18 years old",
  }).optional(),
  bio: z.string().trim().max(500).optional(),
});

export const deleteCurrentUserSchema = z.object({
  password: z.string().min(1, "Password is required"),
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required"),
    newPassword: z
      .string()
      .min(12, "New password must be at least 12 characters")
      .regex(
        PASSWORD_COMPLEXITY_REGEX,
        "New password must include uppercase, lowercase, number, and special character",
      ),
    confirmPassword: z.string().min(1, "Please confirm your new password"),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export const getUsersQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(10),
    role: z.enum(["USER", "ADMIN"]).optional(),
    dateFrom: z.coerce.date().optional(),
    dateTo: z.coerce.date().optional(),
    search: z.string().trim().min(1).max(100).optional(),
    isDeleted: z.coerce.boolean().optional(),
  })
  .refine(
    ({ dateFrom, dateTo }) => {
      if (!dateFrom || !dateTo) {
        return true;
      }

      return dateFrom <= dateTo;
    },
    {
      message: "dateFrom must be before or equal to dateTo",
      path: ["dateFrom"],
    },
  );

export const requestEmailChangeSchema = z.object({
  newEmail: z.string().email(),
});

export const confirmEmailChangeSchema = z.object({
  otp: z
    .string()
    .length(6)
    .regex(/^\d{6}$/, "OTP must be 6 digits"),
});
