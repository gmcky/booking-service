import type { Request, Response } from "express";
import type { AuthenticatedRequest } from "../../shared/types/index.js";
import { getIdParam } from "../../shared/utils/request.helpers.js";
import { ReviewService } from "./review.service.js";
import { logger } from "../../shared/lib/logger.js";

/**
 * Get all reviews for a property
 * @route GET /api/v1/reviews/property/:propertyId?page=1&limit=10
 * @access Public
 */
export async function getPropertyReviews(req: Request, res: Response) {
  const propertyId = getIdParam(req, "propertyId");
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 10;

  // TODO: Add filtering/sorting options
  // - Sort by: recent, highest rating, lowest rating, most helpful
  // - Filter by: rating (5 stars, 4-5 stars, etc.)
  // - Filter by: verified stays only

  // TODO: Add caching (Redis) for popular properties
  // Cache key: `reviews:${propertyId}:${page}:${limit}`
  // TTL: 5 minutes (reviews don't change frequently)

  const result = await ReviewService.getPropertyReviews(propertyId, {
    page,
    limit,
  });
  res.json(result);
}

/**
 * Create a new review
 * @route POST /api/v1/reviews
 * @access Private (must have completed booking)
 * @body { propertyId, rating, comment }
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
