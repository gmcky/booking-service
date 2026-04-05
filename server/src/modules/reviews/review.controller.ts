import type { Request, Response } from "express";
import type { AuthenticatedRequest } from "../../shared/types/index.js";
import { getIdParam } from "../../shared/utils/request.helpers.js";
import { ReviewService } from "./review.service.js";
import type { ReviewQueryInput } from "./review.types.js";

/**
 * Get all reviews for a property
 * @route GET /api/v1/reviews/property/:propertyId?page=1&limit=10
 * @access Public
 */
export async function getPropertyReviews(req: Request, res: Response) {
  const propertyId = getIdParam(req, "propertyId");
  const { page, limit, sort, rating, hasHostReply } =
    req.query as unknown as ReviewQueryInput;

  const result = await ReviewService.getPropertyReviews(
    propertyId,
    {
      page,
      limit,
    },
    {
      sort,
      rating,
      hasHostReply,
    },
  );

  res.json(result);
}

/**
 * Create a new review
 * @route POST /api/v1/reviews
 * @access Private (must have completed booking)
 * @body { bookingId, rating, comment }
 */

export async function createReview(req: AuthenticatedRequest, res: Response) {
  const userId = req.user!.id;
  const review = await ReviewService.create({ ...req.body, userId });
  res.status(201).json(review);
}

export async function updateReview(req: AuthenticatedRequest, res: Response) {
  const id = getIdParam(req);
  const userId = req.user!.id;
  const review = await ReviewService.update(id, userId, req.body);
  res.json(review);
}

export async function deleteReview(req: AuthenticatedRequest, res: Response) {
  const id = getIdParam(req);
  const userId = req.user!.id;
  await ReviewService.delete(id, userId);
  res.status(204).send();
}

export async function replyToReview(req: AuthenticatedRequest, res: Response) {
  const reviewId = getIdParam(req);
  const hostId = req.user!.id;
  const review = await ReviewService.replyToReview(reviewId, {
    hostId,
    text: req.body.text,
  });

  res.json(review);
}

export async function reportReview(req: AuthenticatedRequest, res: Response) {
  const reviewId = getIdParam(req);
  const reporterId = req.user!.id;

  const report = await ReviewService.reportReview(reviewId, {
    reporterId,
    reason: req.body.reason,
  });

  res.status(201).json(report);
}

export async function getPropertyReviewStats(req: Request, res: Response) {
  const propertyId = getIdParam(req, "propertyId");
  const stats = await ReviewService.getPropertyReviewStats(propertyId);
  res.json(stats);
}
