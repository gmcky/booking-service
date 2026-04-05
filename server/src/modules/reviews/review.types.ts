import type { z } from "zod";
import type {
  createReviewSchema,
  replyToReviewSchema,
  reportReviewSchema,
  reviewQuerySchema,
  updateReviewSchema,
} from "./review.validators.js";

export type CreateReviewInput = z.infer<typeof createReviewSchema> & {
  userId: string;
};

export type UpdateReviewInput = z.infer<typeof updateReviewSchema>;

export type ReviewQueryInput = z.infer<typeof reviewQuerySchema>;

export type ReplyToReviewInput = z.infer<typeof replyToReviewSchema> & {
  hostId: string;
};

export type ReportReviewInput = z.infer<typeof reportReviewSchema> & {
  reporterId: string;
};
