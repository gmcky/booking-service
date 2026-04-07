import { Prisma } from "@prisma/client";
import { prisma } from "../../shared/lib/prisma.js";
import { logger } from "../../shared/lib/logger.js";
import {
  cacheDel,
  cacheGet,
  cacheInvalidatePattern,
  cacheSet,
  hashKey,
} from "../../shared/lib/cache.js";
import { emailQueue } from "../../shared/queues/email.queue.js";
import { AppError } from "../../shared/middlewares/error.handler.js";
import type { PaginationParams } from "../../shared/types/index.js";
import {
  calculatePagination,
  createPaginatedResponse,
} from "../../shared/utils/pagination.js";
import { omitUndefined } from "../../shared/utils/prisma.helpers.js";
import type {
  CreateReviewInput,
  ReplyToReviewInput,
  ReportReviewInput,
  ReviewQueryInput,
  UpdateReviewInput,
} from "./review.types.js";

const REVIEW_CREATE_WINDOW_DAYS = 30;
const REVIEW_EDIT_WINDOW_DAYS = 7;
const REVIEWS_CACHE_TTL_SECONDS = 5 * 60;

type ReviewListFilters = Pick<
  ReviewQueryInput,
  "sort" | "rating" | "hasHostReply"
>;

/** Review lifecycle service with booking-scoped invariants and cache invalidation. */
export class ReviewService {
  /** Read flow: filter/sort/paginate property reviews via cache-aside. */
  static async getPropertyReviews(
    propertyId: string,
    params: PaginationParams,
    filters: ReviewListFilters,
  ) {
    const cacheKey = this.getReviewCacheKey(propertyId, params, filters);
    const cached = await cacheGet(cacheKey);
    if (cached) return cached;

    const { skip, take } = calculatePagination(params.page, params.limit);

    const where: Prisma.ReviewWhereInput = {
      propertyId,
      ...(filters.rating !== undefined && { rating: filters.rating }),
      ...(filters.hasHostReply !== undefined &&
        (filters.hasHostReply
          ? { hostReplyText: { not: null } }
          : { hostReplyText: null })),
    };

    const orderBy = this.getReviewOrderBy(filters.sort);

    const [reviews, total] = await Promise.all([
      prisma.review.findMany({
        where,
        skip,
        take,
        include: {
          user: {
            select: {
              firstName: true,
              lastName: true,
            },
          },
          hostReplyBy: {
            select: {
              firstName: true,
              lastName: true,
            },
          },
        },
        orderBy,
      }),
      prisma.review.count({ where }),
    ]);

    const result = createPaginatedResponse(reviews, total, params);
    await cacheSet(cacheKey, result, REVIEWS_CACHE_TTL_SECONDS);
    return result;
  }

  /** Create flow: completed-booking gate + atomic rating aggregate update. */
  static async create(data: CreateReviewInput) {
    const { userId, bookingId, rating, comment } = data;

    const completedBooking = await prisma.booking.findFirst({
      where: {
        id: bookingId,
        userId,
        status: "COMPLETED",
      },
      select: {
        id: true,
        propertyId: true,
        checkOut: true,
        property: {
          select: {
            title: true,
            owner: {
              select: {
                email: true,
                firstName: true,
              },
            },
          },
        },
      },
    });

    if (!completedBooking) {
      throw new AppError(403, "Can only review your completed bookings");
    }

    if (
      !this.isWithinDays(completedBooking.checkOut, REVIEW_CREATE_WINDOW_DAYS)
    ) {
      throw new AppError(
        400,
        `Reviews must be submitted within ${REVIEW_CREATE_WINDOW_DAYS} days of checkout`,
      );
    }

    try {
      const review = await prisma.$transaction(async (tx) => {
        const createdReview = await tx.review.create({
          data: {
            bookingId,
            userId,
            propertyId: completedBooking.propertyId,
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
            hostReplyBy: {
              select: {
                firstName: true,
                lastName: true,
              },
            },
          },
        });

        await this.updatePropertyAverageRatingTx(
          tx,
          completedBooking.propertyId,
        );
        return createdReview;
      });

      await this.invalidateReviewCaches(completedBooking.propertyId);
      await this.enqueueReviewReceivedHostEmail(
        review,
        completedBooking.property.title,
        completedBooking.property.owner.email,
        completedBooking.property.owner.firstName,
      );

      logger.info(
        {
          event: "review_created",
          reviewId: review.id,
          bookingId,
          propertyId: completedBooking.propertyId,
          userId,
          rating,
        },
        "New review created",
      );

      return review;
    } catch (error) {
      this.throwKnownReviewConstraintError(error);
      throw error;
    }
  }

  /** Update flow: owner-only edit within time window + aggregate recompute. */
  static async update(id: string, userId: string, data: UpdateReviewInput) {
    const review = await prisma.review.findUnique({ where: { id } });

    if (!review) {
      throw new AppError(404, "Review not found");
    }

    if (review.userId !== userId) {
      throw new AppError(403, "Not authorized to update this review");
    }

    if (!this.isWithinDays(review.createdAt, REVIEW_EDIT_WINDOW_DAYS)) {
      throw new AppError(
        400,
        `Reviews can only be edited within ${REVIEW_EDIT_WINDOW_DAYS} days`,
      );
    }

    try {
      const updated = await prisma.$transaction(async (tx) => {
        const updatedReview = await tx.review.update({
          where: { id },
          data: omitUndefined({
            ...data,
            comment: data.comment ?? undefined,
          }),
          include: {
            user: {
              select: {
                firstName: true,
                lastName: true,
              },
            },
            hostReplyBy: {
              select: {
                firstName: true,
                lastName: true,
              },
            },
          },
        });

        await this.updatePropertyAverageRatingTx(tx, review.propertyId);
        return updatedReview;
      });

      await this.invalidateReviewCaches(review.propertyId);

      logger.info(
        {
          event: "review_updated",
          reviewId: id,
          userId,
          changedFields: Object.keys(data),
        },
        "Review updated",
      );

      return updated;
    } catch (error) {
      this.throwKnownReviewConstraintError(error);
      throw error;
    }
  }

  /** Delete flow: owner-only delete with aggregate recompute. */
  static async delete(id: string, userId: string) {
    const review = await prisma.review.findUnique({ where: { id } });

    if (!review) {
      throw new AppError(404, "Review not found");
    }

    if (review.userId !== userId) {
      throw new AppError(403, "Not authorized to delete this review");
    }

    await prisma.$transaction(async (tx) => {
      await tx.review.delete({ where: { id } });
      await this.updatePropertyAverageRatingTx(tx, review.propertyId);
    });

    await this.invalidateReviewCaches(review.propertyId);

    logger.info(
      {
        event: "review_deleted",
        reviewId: id,
        userId,
        propertyId: review.propertyId,
      },
      "Review deleted",
    );
  }

  /** Host reply flow: one-shot reply enforced with updateMany race guard. */
  static async replyToReview(reviewId: string, data: ReplyToReviewInput) {
    const { hostId } = data;
    const text = data.text.trim();

    const review = await prisma.review.findUnique({
      where: { id: reviewId },
      select: {
        id: true,
        userId: true,
        propertyId: true,
        hostReplyText: true,
        property: {
          select: {
            ownerId: true,
          },
        },
      },
    });

    if (!review) {
      throw new AppError(404, "Review not found");
    }

    if (review.property.ownerId !== hostId) {
      throw new AppError(403, "Not authorized to reply to this review");
    }

    if (review.userId === hostId) {
      throw new AppError(400, "Hosts cannot reply to their own reviews");
    }

    if (review.hostReplyText) {
      throw new AppError(409, "Host reply already exists for this review");
    }

    const repliedReview = await prisma.$transaction(async (tx) => {
      const { count } = await tx.review.updateMany({
        where: {
          id: reviewId,
          hostReplyText: null,
        },
        data: {
          hostReplyText: text,
          hostReplyCreatedAt: new Date(),
          hostReplyById: hostId,
        },
      });

      if (count !== 1) {
        throw new AppError(409, "Host reply already exists for this review");
      }

      const updated = await tx.review.findUnique({
        where: { id: reviewId },
        include: {
          user: {
            select: {
              firstName: true,
              lastName: true,
            },
          },
          hostReplyBy: {
            select: {
              firstName: true,
              lastName: true,
            },
          },
        },
      });

      if (!updated) {
        throw new AppError(404, "Review not found");
      }

      return updated;
    });

    await this.invalidateReviewCaches(review.propertyId);

    logger.info(
      {
        event: "review_replied",
        reviewId,
        propertyId: review.propertyId,
        hostId,
      },
      "Host replied to review",
    );

    return repliedReview;
  }

  /** Abuse-report flow with duplicate-report guard and async admin notification. */
  static async reportReview(reviewId: string, data: ReportReviewInput) {
    const { reporterId } = data;
    const reason = data.reason.trim();

    const review = await prisma.review.findUnique({
      where: { id: reviewId },
      select: {
        id: true,
        userId: true,
        property: {
          select: {
            title: true,
          },
        },
      },
    });

    if (!review) {
      throw new AppError(404, "Review not found");
    }

    if (review.userId === reporterId) {
      throw new AppError(400, "Cannot report your own review");
    }

    try {
      const report = await prisma.reviewReport.create({
        data: {
          reviewId,
          reporterId,
          reason,
        },
      });

      try {
        const [reporter, admins] = await Promise.all([
          prisma.user.findUnique({
            where: { id: reporterId },
            select: {
              firstName: true,
              lastName: true,
              email: true,
            },
          }),
          prisma.user.findMany({
            where: {
              role: "ADMIN",
            },
            select: {
              email: true,
              firstName: true,
            },
          }),
        ]);

        if (reporter && admins.length > 0) {
          await Promise.all(
            admins.map((admin) =>
              emailQueue.add("review-reported-admin", {
                adminEmail: admin.email,
                adminFirstName: admin.firstName,
                reviewId,
                propertyTitle: review.property.title,
                reporterFullName: `${reporter.firstName} ${reporter.lastName}`,
                reporterEmail: reporter.email,
                reason,
              }),
            ),
          );
        }
      } catch (error) {
        logger.error(
          {
            error,
            reportId: report.id,
            reviewId,
            reporterId,
          },
          "Failed to enqueue review-reported-admin emails",
        );
      }

      logger.info(
        {
          event: "review_reported",
          reportId: report.id,
          reviewId,
          reporterId,
        },
        "Review reported",
      );

      return report;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new AppError(409, "You have already reported this review");
      }

      throw error;
    }
  }

  /** Stats flow for rating distribution and monthly trend series. */
  static async getPropertyReviewStats(propertyId: string) {
    const property = await prisma.property.findUnique({
      where: { id: propertyId },
      select: { id: true },
    });

    if (!property) {
      throw new AppError(404, "Property not found");
    }

    const [aggregate, groupedByRating, recentReviews] = await Promise.all([
      prisma.review.aggregate({
        where: { propertyId },
        _avg: { rating: true },
        _count: { _all: true },
      }),
      prisma.review.groupBy({
        by: ["rating"],
        where: { propertyId },
        _count: { rating: true },
      }),
      prisma.review.findMany({
        where: {
          propertyId,
          createdAt: {
            gte: this.getTrendWindowStartDate(6),
          },
        },
        select: {
          createdAt: true,
          rating: true,
        },
        orderBy: {
          createdAt: "asc",
        },
      }),
    ]);

    const breakdown = {
      1: 0,
      2: 0,
      3: 0,
      4: 0,
      5: 0,
    } as Record<number, number>;

    for (const group of groupedByRating) {
      breakdown[group.rating] = group._count.rating;
    }

    const trendMap = new Map<
      string,
      { month: string; sum: number; count: number }
    >();

    for (const review of recentReviews) {
      const month = `${review.createdAt.getUTCFullYear()}-${String(review.createdAt.getUTCMonth() + 1).padStart(2, "0")}`;
      const current = trendMap.get(month) ?? { month, sum: 0, count: 0 };
      current.sum += review.rating;
      current.count += 1;
      trendMap.set(month, current);
    }

    const recentTrend = Array.from(trendMap.values()).map((entry) => ({
      month: entry.month,
      averageRating: Number((entry.sum / entry.count).toFixed(1)),
      totalReviews: entry.count,
    }));

    return {
      averageRating:
        aggregate._avg.rating === null
          ? null
          : Number(aggregate._avg.rating.toFixed(1)),
      totalReviews: aggregate._count._all,
      breakdown,
      recentTrend,
    };
  }

  private static async updatePropertyAverageRatingTx(
    tx: Prisma.TransactionClient,
    propertyId: string,
  ) {
    const result = await tx.review.aggregate({
      where: { propertyId },
      _avg: { rating: true },
      _count: true,
    });

    await tx.property.update({
      where: { id: propertyId },
      data: {
        averageRating: result._avg.rating,
        reviewCount: result._count,
      },
    });
  }

  private static async enqueueReviewReceivedHostEmail(
    review: {
      id: string;
      rating: number;
      comment: string | null;
      user: {
        firstName: string;
        lastName: string;
      };
    },
    propertyTitle: string,
    hostEmail: string,
    hostFirstName: string,
  ) {
    try {
      await emailQueue.add("review-received-host", {
        reviewId: review.id,
        hostEmail,
        hostFirstName,
        propertyTitle,
        guestFirstName: review.user.firstName,
        guestLastName: review.user.lastName,
        rating: review.rating,
        comment: review.comment,
      });
    } catch (error) {
      logger.error(
        { error, reviewId: review.id },
        "Failed to enqueue review-received-host email",
      );
    }
  }

  private static async invalidateReviewCaches(propertyId: string) {
    await Promise.all([
      cacheInvalidatePattern(`reviews:property:${propertyId}:*`),
      cacheDel(`property:${propertyId}`),
      cacheInvalidatePattern("properties:search:*"),
    ]);
  }

  private static getReviewOrderBy(sort: ReviewListFilters["sort"]) {
    if (sort === "highest") {
      return [{ rating: "desc" as const }, { createdAt: "desc" as const }];
    }

    if (sort === "lowest") {
      return [{ rating: "asc" as const }, { createdAt: "desc" as const }];
    }

    return [{ createdAt: "desc" as const }];
  }

  private static getReviewCacheKey(
    propertyId: string,
    params: PaginationParams,
    filters: ReviewListFilters,
  ) {
    const suffix = hashKey({ params, filters });
    return `reviews:property:${propertyId}:${suffix}`;
  }

  private static isWithinDays(date: Date, days: number) {
    const now = Date.now();
    const elapsedMs = now - date.getTime();
    return elapsedMs <= days * 24 * 60 * 60 * 1000;
  }

  // Trend window includes current month plus previous full (months - 1) months.
  private static getTrendWindowStartDate(months: number) {
    const date = new Date();
    date.setUTCDate(1);
    date.setUTCHours(0, 0, 0, 0);
    date.setUTCMonth(date.getUTCMonth() - months + 1);
    return date;
  }

  private static throwKnownReviewConstraintError(error: unknown) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError)) {
      return;
    }

    if (error.code === "P2004") {
      throw new AppError(400, "Rating must be between 1 and 5");
    }

    if (error.code !== "P2002") {
      // Unknown review constraint; let caller rethrow original Prisma error.
      return;
    }

    const target = Array.isArray(error.meta?.target)
      ? error.meta.target.join(",")
      : String(error.meta?.target ?? "");

    if (target.includes("bookingId")) {
      throw new AppError(409, "This booking already has a review");
    }

    // Only bookingId unique is remapped; other uniques pass through.
  }
}
