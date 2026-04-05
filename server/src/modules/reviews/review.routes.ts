import { Router, type IRouter } from "express";
import { authenticate, authorize } from "../../shared/middlewares/auth.js";
import { validate } from "../../shared/middlewares/validate.js";
import { asyncHandler } from "../../shared/utils/async.handler.js";
import * as reviewController from "./review.controller.js";
import {
  createReviewSchema,
  replyToReviewSchema,
  reportReviewSchema,
  reviewQuerySchema,
  updateReviewSchema,
} from "./review.validators.js";

export const reviewRouter: IRouter = Router();

// Public: Get reviews for a property
reviewRouter.get(
  "/property/:propertyId",
  validate(reviewQuerySchema, "query"),
  asyncHandler(reviewController.getPropertyReviews),
);

reviewRouter.get(
  "/property/:propertyId/stats",
  asyncHandler(reviewController.getPropertyReviewStats),
);

// Protected routes
reviewRouter.use(authenticate);

reviewRouter.post(
  "/",
  validate(createReviewSchema),
  asyncHandler(reviewController.createReview),
);

reviewRouter.patch(
  "/:id",
  validate(updateReviewSchema),
  asyncHandler(reviewController.updateReview),
);

reviewRouter.patch(
  "/:id/reply",
  authorize("OWNER"),
  validate(replyToReviewSchema),
  asyncHandler(reviewController.replyToReview),
);

reviewRouter.post(
  "/:id/report",
  validate(reportReviewSchema),
  asyncHandler(reviewController.reportReview),
);

reviewRouter.delete("/:id", asyncHandler(reviewController.deleteReview));
