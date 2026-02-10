import { prisma } from "../../shared/lib/prisma.js";
import { AppError } from "../../shared/middlewares/error.handler.js";
import { logger } from "../../shared/lib/logger.js";
import type { PaginationParams } from "../../shared/types/index.js";
import {
  calculatePagination,
  createPaginatedResponse,
} from "../../shared/utils/pagination.js";
import { omitUndefined } from "../../shared/utils/prisma.helpers.js";
import type { CreateReviewInput, UpdateReviewInput } from "./review.types.js";

/**
 * ReviewService - Manages property reviews and ratings
 *
 * BUSINESS RULES:
 * 1. Users can only review properties they have COMPLETED bookings for
 * 2. One review per user per property (prevent spam)
 * 3. Rating must be 1-5 stars
 * 4. Property averageRating must be updated atomically with review creation
 * 5. Reviews can be edited/deleted by owner only
 * 6. Host can respond to reviews (add feature)
 */
export class ReviewService {
  static async getPropertyReviews(
    propertyId: string,
    params: PaginationParams,
  ) {
    const { skip, take } = calculatePagination(params.page, params.limit);

    const [reviews, total] = await Promise.all([
      prisma.review.findMany({
        where: { propertyId },
        skip,
        take,
        include: {
          user: {
            select: {
              firstName: true,
              lastName: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.review.count({ where: { propertyId } }),
    ]);

    return createPaginatedResponse(reviews, total, params);
  }

  static async create(data: CreateReviewInput) {
    const { userId, propertyId, rating, comment } = data;

    // TODO: Validate rating range (should be done in Zod validator)
    // if (rating < 1 || rating > 5) {
    //   throw new AppError(400, 'Rating must be between 1 and 5');
    // }

    // ✅ BUSINESS RULE: Check if user has completed booking for this property
    // This prevents fake reviews from users who never stayed at the property
    const completedBooking = await prisma.booking.findFirst({
      where: {
        userId,
        propertyId,
        status: "COMPLETED",
      },
    });

    if (!completedBooking) {
      throw new AppError(403, "Can only review properties you have stayed at");
    }

    // TODO: Add timing restriction - reviews within 30 days of checkout
    // Prevents very old reviews that may not reflect current property state
    //
    // const thirtyDaysAgo = new Date();
    // thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    //
    // if (completedBooking.checkOut < thirtyDaysAgo) {
    //   throw new AppError(400, 'Reviews must be submitted within 30 days of checkout');
    // }

    // ✅ ANTI-SPAM: Check if user already reviewed this property
    const existingReview = await prisma.review.findFirst({
      where: { userId, propertyId },
    });

    if (existingReview) {
      throw new AppError(409, "You have already reviewed this property");
    }

    // ⚠️ CRITICAL IMPROVEMENT NEEDED: Use Transaction for Atomicity
    // Current code has 2 separate operations:
    // 1. Create review
    // 2. Update property rating
    // Problem: If step 2 fails, we have a review without updated rating!
    //
    // SOLUTION: Use Prisma $transaction to make both operations atomic
    //
    // const result = await prisma.$transaction(async (tx) => {
    //   // Step 1: Create review (within transaction)
    //   const review = await tx.review.create({
    //     data: {
    //       userId,
    //       propertyId,
    //       rating,
    //       comment: comment ?? null,
    //     },
    //     include: {
    //       user: {
    //         select: {
    //           firstName: true,
    //           lastName: true,
    //         },
    //       },
    //     },
    //   });
    //
    //   // Step 2: Calculate new average rating (within same transaction)
    //   const aggregateResult = await tx.review.aggregate({
    //     where: { propertyId },
    //     _avg: { rating: true },
    //     _count: true,
    //   });
    //
    //   // Step 3: Update property with new rating (within same transaction)
    //   await tx.property.update({
    //     where: { id: propertyId },
    //     data: {
    //       averageRating: aggregateResult._avg.rating,
    //       reviewCount: aggregateResult._count,
    //     },
    //   });
    //
    //   return review;
    // });
    //
    // Why this is better:
    // - All-or-nothing: Either both succeed or both fail
    // - No inconsistent state (review exists but rating not updated)
    // - Better performance: Single database round-trip
    // - Prevents race conditions if multiple reviews submitted simultaneously

    // Current implementation (NOT atomic - needs improvement)
    const review = await prisma.review.create({
      data: {
        userId,
        propertyId,
        rating,
        comment: comment ?? null,
      },
      include: {
        user: {
          select: {
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    // Update property average rating (separate operation - not atomic!)
    await this.updatePropertyAverageRating(propertyId);

    // TODO: Trigger background job to notify property owner
    // await emailQueue.add('new-review-notification', {
    //   propertyId,
    //   reviewId: review.id,
    //   rating,
    //   comment
    // });

    // TODO: Log review creation (for analytics)
    // logger.info({
    //   event: 'review_created',
    //   reviewId: review.id,
    //   propertyId,
    //   userId,
    //   rating
    // }, 'New review created');

    return review;
  }

  static async update(id: string, userId: string, data: UpdateReviewInput) {
    const review = await prisma.review.findUnique({ where: { id } });

    if (!review) {
      throw new AppError(404, "Review not found");
    }

    // ✅ SECURITY: Users can only update their own reviews
    if (review.userId !== userId) {
      throw new AppError(403, "Not authorized to update this review");
    }

    // TODO: Add time restriction - only allow edits within 7 days
    // const sevenDaysAgo = new Date();
    // sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    // if (review.createdAt < sevenDaysAgo) {
    //   throw new AppError(400, 'Reviews can only be edited within 7 days');
    // }

    // TODO: Use transaction for atomic update (same reason as create)
    // If rating changes, we need to recalculate property average
    //
    // return await prisma.$transaction(async (tx) => {
    //   const updated = await tx.review.update({
    //     where: { id },
    //     data: omitUndefined({
    //       ...data,
    //       comment: data.comment ?? undefined,
    //     }),
    //   });
    //
    //   // Only recalculate if rating changed
    //   if (data.rating && data.rating !== review.rating) {
    //     const aggregateResult = await tx.review.aggregate({
    //       where: { propertyId: review.propertyId },
    //       _avg: { rating: true },
    //     });
    //
    //     await tx.property.update({
    //       where: { id: review.propertyId },
    //       data: { averageRating: aggregateResult._avg.rating },
    //     });
    //   }
    //
    //   return updated;
    // });

    const updated = await prisma.review.update({
      where: { id },
      data: omitUndefined({
        ...data,
        comment: data.comment ?? undefined,
      }),
    });

    // Recalculate property average rating
    await this.updatePropertyAverageRating(review.propertyId);

    // TODO: Log review update
    // logger.info({ reviewId: id, userId, changes: Object.keys(data) }, 'Review updated');

    return updated;
  }

  static async delete(id: string, userId: string) {
    const review = await prisma.review.findUnique({ where: { id } });

    if (!review) {
      throw new AppError(404, "Review not found");
    }

    // ✅ SECURITY: Users can only delete their own reviews
    if (review.userId !== userId) {
      throw new AppError(403, "Not authorized to delete this review");
    }

    // TODO: Use transaction for atomic delete + rating update
    // Same reason as create/update - ensure consistency
    //
    // await prisma.$transaction(async (tx) => {
    //   // Step 1: Delete review
    //   await tx.review.delete({ where: { id } });
    //
    //   // Step 2: Recalculate property average (excluding deleted review)
    //   const aggregateResult = await tx.review.aggregate({
    //     where: { propertyId: review.propertyId },
    //     _avg: { rating: true },
    //     _count: true,
    //   });
    //
    //   // Step 3: Update property
    //   await tx.property.update({
    //     where: { id: review.propertyId },
    //     data: {
    //       averageRating: aggregateResult._avg.rating || null, // null if no reviews left
    //       reviewCount: aggregateResult._count,
    //     },
    //   });
    // });

    await prisma.review.delete({ where: { id } });

    // Recalculate property average rating
    await this.updatePropertyAverageRating(review.propertyId);

    // TODO: Log review deletion
    // logger.info({ reviewId: id, userId, propertyId: review.propertyId }, 'Review deleted');
  }

  /**
   * Update property's average rating and review count
   *
   * ⚠️ PERFORMANCE NOTE:
   * This is called after every review create/update/delete.
   * For high-traffic properties, consider:
   * 1. Using a database trigger instead (automatic)
   * 2. Denormalizing rating in Property table (current approach - good for reads)
   * 3. Caching rating calculation results
   *
   * Current approach is CORRECT for consistency but could be optimized.
   */
  private static async updatePropertyAverageRating(propertyId: string) {
    // TODO: Consider moving this to a database trigger for better performance
    // PostgreSQL trigger would automatically update averageRating on review changes
    //
    // CREATE OR REPLACE FUNCTION update_property_rating()
    // RETURNS TRIGGER AS $$
    // BEGIN
    //   UPDATE "Property"
    //   SET "averageRating" = (SELECT AVG(rating) FROM "Review" WHERE "propertyId" = NEW."propertyId"),
    //       "reviewCount" = (SELECT COUNT(*) FROM "Review" WHERE "propertyId" = NEW."propertyId")
    //   WHERE id = NEW."propertyId";
    //   RETURN NEW;
    // END;
    // $$ LANGUAGE plpgsql;

    const result = await prisma.review.aggregate({
      where: { propertyId },
      _avg: { rating: true },
      _count: true,
    });

    await prisma.property.update({
      where: { id: propertyId },
      data: {
        averageRating: result._avg.rating,
        reviewCount: result._count,
      },
    });
  }

  // TODO: Add method for host to respond to reviews
  // static async addHostResponse(reviewId: string, hostId: string, response: string) {
  //   // Verify host owns the property
  //   // Add response field to Review model
  //   // Notify guest about host response
  // }

  // TODO: Add method to report inappropriate reviews
  // static async reportReview(reviewId: string, reporterId: string, reason: string) {
  //   // Create report record
  //   // Notify admins
  //   // Implement moderation workflow
  // }

  // TODO: Add method to get review statistics
  // static async getPropertyReviewStats(propertyId: string) {
  //   // Return breakdown by star rating (5 stars: 10, 4 stars: 5, etc.)
  //   // Return common keywords from comments (sentiment analysis)
  //   // Return average rating trend over time
  // }
}
