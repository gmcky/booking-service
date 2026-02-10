import { Router, type IRouter } from "express";
import { authenticate } from "../../shared/middlewares/auth.js";
import { validate } from "../../shared/middlewares/validate.js";
import { asyncHandler } from "../../shared/utils/async.handler.js";
import * as reviewController from "./review.controller.js";
import { createReviewSchema, updateReviewSchema } from "./review.validators.js";

export const reviewRouter: IRouter = Router();

// Public: Get reviews for a property
reviewRouter.get(
  "/property/:propertyId",
  asyncHandler(reviewController.getPropertyReviews),
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

reviewRouter.delete("/:id", asyncHandler(reviewController.deleteReview));
