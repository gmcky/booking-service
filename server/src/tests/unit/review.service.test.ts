import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockDeep, mockReset, type DeepMockProxy } from "vitest-mock-extended";
import { Prisma, type PrismaClient } from "@prisma/client";

vi.mock("../../shared/lib/prisma.js", () => ({
  prisma: mockDeep<PrismaClient>(),
}));

vi.mock("../../shared/lib/cache.js", () => ({
  cacheGet: vi.fn(),
  cacheSet: vi.fn(),
  cacheDel: vi.fn(),
  cacheInvalidatePattern: vi.fn(),
  hashKey: vi.fn(() => "hash"),
}));

vi.mock("../../shared/queues/email.queue.js", () => ({
  emailQueue: {
    add: vi.fn(),
  },
}));

import { prisma } from "../../shared/lib/prisma.js";
import {
  cacheGet,
  cacheInvalidatePattern,
  cacheDel,
} from "../../shared/lib/cache.js";
import { emailQueue } from "../../shared/queues/email.queue.js";
import { ReviewService } from "../../modules/reviews/review.service.js";

const mockPrisma = prisma as unknown as DeepMockProxy<PrismaClient>;
const mockCacheGet = cacheGet as unknown as ReturnType<typeof vi.fn>;
const mockCacheInvalidatePattern =
  cacheInvalidatePattern as unknown as ReturnType<typeof vi.fn>;
const mockCacheDel = cacheDel as unknown as ReturnType<typeof vi.fn>;
const mockEmailQueue = emailQueue as unknown as {
  add: ReturnType<typeof vi.fn>;
};

describe("ReviewService", () => {
  beforeEach(() => {
    mockReset(mockPrisma);
    vi.clearAllMocks();
  });

  it("returns cached property reviews when cache hit exists", async () => {
    const cached = {
      data: [{ id: "review-1" }],
      pagination: { page: 1, limit: 10, total: 1, totalPages: 1 },
    };

    mockCacheGet.mockResolvedValue(cached);

    const result = await ReviewService.getPropertyReviews(
      "property-1",
      { page: 1, limit: 10 },
      { sort: "recent", rating: undefined, hasHostReply: undefined },
    );

    expect(result).toEqual(cached);
    expect(mockPrisma.review.findMany).not.toHaveBeenCalled();
    expect(mockPrisma.review.count).not.toHaveBeenCalled();
  });

  it("rejects review creation if checkout is older than 30 days", async () => {
    const oldCheckout = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);

    mockPrisma.booking.findFirst.mockResolvedValue({
      id: "booking-1",
      propertyId: "property-1",
      checkOut: oldCheckout,
      property: {
        title: "Test Property",
        owner: { email: "owner@test.com", firstName: "Host" },
      },
    } as any);

    await expect(
      ReviewService.create({
        bookingId: "booking-1",
        userId: "user-1",
        rating: 5,
        comment: "Very clean and comfortable stay",
      }),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: "Reviews must be submitted within 30 days of checkout",
    });
  });

  it("blocks host reply from non-owner", async () => {
    mockPrisma.review.findUnique.mockResolvedValue({
      id: "review-1",
      userId: "guest-1",
      propertyId: "property-1",
      hostReplyText: null,
      property: { ownerId: "owner-2" },
    } as any);

    await expect(
      ReviewService.replyToReview("review-1", {
        hostId: "owner-1",
        text: "Thanks for your feedback!",
      }),
    ).rejects.toMatchObject({
      statusCode: 403,
      message: "Not authorized to reply to this review",
    });
  });

  it("allows admin to delete someone else's review", async () => {
    mockPrisma.review.findUnique.mockResolvedValue({
      id: "review-1",
      userId: "guest-1",
      propertyId: "property-1",
    } as any);
    mockPrisma.review.aggregate.mockResolvedValue({
      _avg: { rating: 4.5 },
      _count: 2,
    } as any);
    mockPrisma.property.update.mockResolvedValue({ id: "property-1" } as any);
    mockPrisma.$transaction.mockImplementation(async (cb: any) =>
      cb(mockPrisma),
    );

    await ReviewService.delete("review-1", "admin-1", "ADMIN");

    expect(mockPrisma.review.delete).toHaveBeenCalledWith({
      where: { id: "review-1" },
    });
    expect(mockPrisma.property.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "property-1" },
      }),
    );
    expect(mockCacheInvalidatePattern).toHaveBeenCalledWith(
      "reviews:property:property-1:*",
    );
  });

  it("rejects review deletion from non-author non-admin user", async () => {
    mockPrisma.review.findUnique.mockResolvedValue({
      id: "review-2",
      userId: "guest-2",
      propertyId: "property-2",
    } as any);

    await expect(
      ReviewService.delete("review-2", "user-3", "USER"),
    ).rejects.toMatchObject({
      statusCode: 403,
      message: "Not authorized to delete this review",
    });

    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it("adds host reply once and invalidates review caches", async () => {
    (mockPrisma.review.findUnique as any)
      .mockResolvedValueOnce({
        id: "review-1",
        userId: "guest-1",
        propertyId: "property-1",
        hostReplyText: null,
        property: { ownerId: "owner-1" },
      })
      .mockResolvedValueOnce({
        id: "review-1",
        user: { firstName: "Guest", lastName: "User" },
        hostReplyBy: { firstName: "Host", lastName: "Owner" },
        hostReplyText: "Thanks for your feedback!",
      });

    mockPrisma.review.updateMany.mockResolvedValue({ count: 1 } as any);
    mockPrisma.$transaction.mockImplementation(async (cb: any) =>
      cb(mockPrisma),
    );

    const result = await ReviewService.replyToReview("review-1", {
      hostId: "owner-1",
      text: "Thanks for your feedback!",
    });

    expect(mockPrisma.review.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "review-1", hostReplyText: null },
      }),
    );
    expect(result.hostReplyText).toBe("Thanks for your feedback!");
    expect(mockCacheInvalidatePattern).toHaveBeenCalledWith(
      "reviews:property:property-1:*",
    );
    expect(mockCacheDel).toHaveBeenCalledWith("property:property-1");
  });

  it("creates report and notifies all admins", async () => {
    mockPrisma.review.findUnique.mockResolvedValue({
      id: "review-1",
      userId: "guest-1",
      property: { title: "Lake House" },
    } as any);

    mockPrisma.reviewReport.create.mockResolvedValue({
      id: "report-1",
      reviewId: "review-1",
      reporterId: "user-2",
      reason: "Spam and insults in the review",
      status: "PENDING",
    } as any);

    (mockPrisma.user.findFirst as any).mockResolvedValue({
      firstName: "Ira",
      lastName: "Reporter",
      email: "ira@example.com",
    } as any);

    mockPrisma.user.findMany.mockResolvedValue([
      { email: "admin1@example.com", firstName: "Admin1" },
      { email: "admin2@example.com", firstName: "Admin2" },
    ] as any);

    const report = await ReviewService.reportReview("review-1", {
      reporterId: "user-2",
      reason: "Spam and insults in the review",
    });

    expect(report.id).toBe("report-1");
    expect(mockEmailQueue.add).toHaveBeenCalledTimes(2);
    expect(mockEmailQueue.add).toHaveBeenCalledWith(
      "review-reported-admin",
      expect.objectContaining({ reviewId: "review-1" }),
    );
  });

  it("returns report even if admin notification enqueue fails", async () => {
    mockPrisma.review.findUnique.mockResolvedValue({
      id: "review-1",
      userId: "guest-1",
      property: { title: "Lake House" },
    } as any);

    mockPrisma.reviewReport.create.mockResolvedValue({
      id: "report-1",
      reviewId: "review-1",
      reporterId: "user-2",
      reason: "Spam and insults in the review",
      status: "PENDING",
    } as any);

    (mockPrisma.user.findFirst as any).mockResolvedValue({
      firstName: "Ira",
      lastName: "Reporter",
      email: "ira@example.com",
    } as any);

    mockPrisma.user.findMany.mockResolvedValue([
      { email: "admin1@example.com", firstName: "Admin1" },
    ] as any);

    mockEmailQueue.add.mockRejectedValue(new Error("Queue unavailable"));

    const report = await ReviewService.reportReview("review-1", {
      reporterId: "user-2",
      reason: "Spam and insults in the review",
    });

    expect(report.id).toBe("report-1");
    expect(mockPrisma.reviewReport.create).toHaveBeenCalledTimes(1);
    expect(mockEmailQueue.add).toHaveBeenCalledTimes(1);
  });

  it("returns report even if admin lookup fails", async () => {
    mockPrisma.review.findUnique.mockResolvedValue({
      id: "review-1",
      userId: "guest-1",
      property: { title: "Lake House" },
    } as any);

    mockPrisma.reviewReport.create.mockResolvedValue({
      id: "report-1",
      reviewId: "review-1",
      reporterId: "user-2",
      reason: "Spam and insults in the review",
      status: "PENDING",
    } as any);

    mockPrisma.user.findUnique.mockResolvedValue({
      firstName: "Ira",
      lastName: "Reporter",
      email: "ira@example.com",
    } as any);

    mockPrisma.user.findMany.mockRejectedValue(new Error("Lookup failed"));

    const report = await ReviewService.reportReview("review-1", {
      reporterId: "user-2",
      reason: "Spam and insults in the review",
    });

    expect(report.id).toBe("report-1");
    expect(mockPrisma.reviewReport.create).toHaveBeenCalledTimes(1);
    expect(mockEmailQueue.add).not.toHaveBeenCalled();
  });

  it("maps bookingId unique violation to 409 on create", async () => {
    const prismaError = new Prisma.PrismaClientKnownRequestError(
      "Unique constraint failed",
      {
        code: "P2002",
        clientVersion: "test",
      },
    );
    (prismaError as any).meta = { target: ["bookingId"] };

    mockPrisma.booking.findFirst.mockResolvedValue({
      id: "booking-1",
      propertyId: "property-1",
      checkOut: new Date(Date.now() - 24 * 60 * 60 * 1000),
      property: {
        title: "Test Property",
        owner: { email: "owner@test.com", firstName: "Host" },
      },
    } as any);

    mockPrisma.$transaction.mockRejectedValue(prismaError);

    await expect(
      ReviewService.create({
        bookingId: "booking-1",
        userId: "user-1",
        rating: 5,
        comment: "Great place and very responsive host",
      }),
    ).rejects.toMatchObject({
      statusCode: 409,
      message: "This booking already has a review",
    });
  });

  it("rethrows unknown Prisma constraint errors on create", async () => {
    const prismaError = new Prisma.PrismaClientKnownRequestError(
      "Unexpected constraint error",
      {
        code: "P2010",
        clientVersion: "test",
      },
    );

    mockPrisma.booking.findFirst.mockResolvedValue({
      id: "booking-1",
      propertyId: "property-1",
      checkOut: new Date(Date.now() - 24 * 60 * 60 * 1000),
      property: {
        title: "Test Property",
        owner: { email: "owner@test.com", firstName: "Host" },
      },
    } as any);

    mockPrisma.$transaction.mockRejectedValue(prismaError);

    await expect(
      ReviewService.create({
        bookingId: "booking-1",
        userId: "user-1",
        rating: 4,
        comment: "Nice stay and smooth check-in experience",
      }),
    ).rejects.toBe(prismaError);
  });

  it("maps rating check constraint violation to 400 on update", async () => {
    const prismaError = new Prisma.PrismaClientKnownRequestError(
      "Check constraint failed",
      {
        code: "P2004",
        clientVersion: "test",
      },
    );

    mockPrisma.review.findUnique.mockResolvedValue({
      id: "review-1",
      userId: "user-1",
      propertyId: "property-1",
      createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
    } as any);

    mockPrisma.$transaction.mockRejectedValue(prismaError);

    await expect(
      ReviewService.update("review-1", "user-1", {
        rating: 7,
      }),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: "Rating must be between 1 and 5",
    });
  });

  it("rethrows unknown Prisma constraint errors on update", async () => {
    const prismaError = new Prisma.PrismaClientKnownRequestError(
      "Unexpected constraint error",
      {
        code: "P2010",
        clientVersion: "test",
      },
    );

    mockPrisma.review.findUnique.mockResolvedValue({
      id: "review-1",
      userId: "user-1",
      propertyId: "property-1",
      createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
    } as any);

    mockPrisma.$transaction.mockRejectedValue(prismaError);

    await expect(
      ReviewService.update("review-1", "user-1", {
        rating: 4,
      }),
    ).rejects.toBe(prismaError);
  });
});
