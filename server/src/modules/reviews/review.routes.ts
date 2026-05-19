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

/**
 * @openapi
 * /reviews/property/{propertyId}:
 *   get:
 *     tags: [Reviews]
 *     summary: List reviews for a property
 *     parameters:
 *       - { in: path, name: propertyId, required: true, schema: { type: string, format: uuid } }
 *       - { in: query, name: page, schema: { type: integer, default: 1 } }
 *       - { in: query, name: limit, schema: { type: integer, default: 10, maximum: 50 } }
 *       - { in: query, name: sort, schema: { type: string, enum: [recent, highest, lowest], default: recent } }
 *       - { in: query, name: rating, schema: { type: integer, minimum: 1, maximum: 5 } }
 *       - { in: query, name: hasHostReply, schema: { type: boolean } }
 *     responses:
 *       200: { description: Paginated review list }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
reviewRouter.get(
  "/property/:propertyId",
  validate(reviewQuerySchema, "query"),
  asyncHandler(reviewController.getPropertyReviews),
);

/**
 * @openapi
 * /reviews/property/{propertyId}/stats:
 *   get:
 *     tags: [Reviews]
 *     summary: Aggregated review stats for a property
 *     parameters:
 *       - { in: path, name: propertyId, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200: { description: Average rating + distribution }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
reviewRouter.get(
  "/property/:propertyId/stats",
  asyncHandler(reviewController.getPropertyReviewStats),
);

reviewRouter.use(authenticate);

/**
 * @openapi
 * /reviews:
 *   post:
 *     tags: [Reviews]
 *     summary: Create review for completed booking (guest)
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [bookingId, rating]
 *             properties:
 *               bookingId: { type: string, format: uuid }
 *               rating: { type: integer, minimum: 1, maximum: 5 }
 *               comment: { type: string, minLength: 10, maxLength: 1000 }
 *     responses:
 *       201: { description: Review created }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
reviewRouter.post(
  "/",
  validate(createReviewSchema),
  asyncHandler(reviewController.createReview),
);

/**
 * @openapi
 * /reviews/{id}:
 *   patch:
 *     tags: [Reviews]
 *     summary: Edit own review
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               rating: { type: integer, minimum: 1, maximum: 5 }
 *               comment: { type: string, minLength: 10, maxLength: 1000 }
 *     responses:
 *       200: { description: Review updated }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
reviewRouter.patch(
  "/:id",
  validate(updateReviewSchema),
  asyncHandler(reviewController.updateReview),
);

/**
 * @openapi
 * /reviews/{id}/reply:
 *   patch:
 *     tags: [Reviews]
 *     summary: Host reply to a review on own property
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [text]
 *             properties:
 *               text: { type: string, minLength: 1, maxLength: 2000 }
 *     responses:
 *       200: { description: Reply saved }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
reviewRouter.patch(
  "/:id/reply",
  validate(replyToReviewSchema),
  asyncHandler(reviewController.replyToReview),
);

/**
 * @openapi
 * /reviews/{id}/report:
 *   post:
 *     tags: [Reviews]
 *     summary: Report a review for moderation
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [reason]
 *             properties:
 *               reason: { type: string, minLength: 10, maxLength: 1000 }
 *     responses:
 *       201: { description: Report submitted }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
reviewRouter.post(
  "/:id/report",
  validate(reportReviewSchema),
  asyncHandler(reviewController.reportReview),
);

/**
 * @openapi
 * /reviews/{id}:
 *   delete:
 *     tags: [Reviews]
 *     summary: Delete own review or ADMIN moderation
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       204: { description: Review deleted }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
reviewRouter.delete("/:id", asyncHandler(reviewController.deleteReview));
