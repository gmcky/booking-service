import type { z } from "zod";
import type {
  createReviewSchema,
  updateReviewSchema,
} from "./review.validators.js";

export type CreateReviewInput = z.infer<typeof createReviewSchema> & {
  userId: string;
};

export type UpdateReviewInput = z.infer<typeof updateReviewSchema>;
