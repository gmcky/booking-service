import { z } from "zod";

const booleanStringSchema = z.enum(["true", "false"]).transform((value) => value === "true");

const optionalBooleanStringSchema = z.preprocess((value) => {
  if (value === undefined) return undefined;
  if (value === true || value === false) return String(value);
  return value;
}, booleanStringSchema.optional());

const categoryRating = z.number().int().min(1).max(5).optional();

// The six optional per-category ratings, reused by create and update.
const reviewCategories = {
  cleanliness: categoryRating,
  accuracy: categoryRating,
  checkIn: categoryRating,
  communication: categoryRating,
  location: categoryRating,
  value: categoryRating,
};

export const createReviewSchema = z.object({
  bookingId: z.string().uuid(),
  rating: z.number().int().min(1).max(5),
  comment: z.string().min(10).max(1000).optional(),
  ...reviewCategories,
});

export const updateReviewSchema = z.object({
  rating: z.number().int().min(1).max(5).optional(),
  comment: z.string().min(10).max(1000).optional(),
  ...reviewCategories,
});

export const reviewQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  sort: z.enum(["recent", "highest", "lowest"]).default("recent"),
  rating: z.coerce.number().int().min(1).max(5).optional(),
  hasHostReply: optionalBooleanStringSchema,
});

export const replyToReviewSchema = z.object({
  text: z.string().trim().min(1).max(2000),
});

export const reportReviewSchema = z.object({
  reason: z.string().trim().min(10).max(1000),
});
