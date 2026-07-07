import { describe, it, expect, beforeEach, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { mockDeep, mockReset, type DeepMockProxy } from "vitest-mock-extended";

vi.mock("../../shared/lib/prisma.js", () => ({
  prisma: mockDeep<PrismaClient>(),
}));

vi.mock("../../shared/lib/cache.js", () => ({
  cacheClient: {
    set: vi.fn(),
    del: vi.fn(),
    get: vi.fn(),
    incr: vi.fn(),
    ttl: vi.fn(),
    expire: vi.fn(),
  },
  cacheGet: vi.fn(),
  cacheSet: vi.fn(),
  cacheDel: vi.fn(),
  cacheGetNamespaceVersion: vi.fn().mockResolvedValue("0"),
  cacheInvalidateNamespace: vi.fn(),
  hashKey: vi.fn(() => "hash"),
}));

vi.mock("../../shared/queues/email.queue.js", () => ({
  emailQueue: { add: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock("../../shared/queues/image.queue.js", () => ({
  imageQueue: { add: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock("../../shared/lib/storage.js", () => ({
  deleteFromS3: vi.fn().mockResolvedValue(undefined),
  uploadToS3: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../auth/auth.cache.js", () => ({
  invalidateUserAuthCache: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("node:fs/promises", () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  writeFile: vi.fn().mockResolvedValue(undefined),
}));

import { prisma } from "../../shared/lib/prisma.js";
import { UserService } from "../../modules/users/user.service.js";

const mockPrisma = prisma as unknown as DeepMockProxy<PrismaClient>;

describe("UserService.getHostReviews", () => {
  beforeEach(() => {
    mockReset(mockPrisma);
  });

  it("throws 404 when the user does not exist", async () => {
    mockPrisma.user.findFirst.mockResolvedValue(null);

    await expect(
      UserService.getHostReviews("missing-user", { page: 1, limit: 10 }),
    ).rejects.toMatchObject({
      statusCode: 404,
      // Exact message is load-bearing: the client's host profile page
      // matches this string to show its "Host not found" state.
      message: "User not found",
    });

    expect(mockPrisma.review.findMany).not.toHaveBeenCalled();
  });

  it("returns paginated reviews scoped to the host's active listings", async () => {
    mockPrisma.user.findFirst.mockResolvedValue({ id: "host-1" } as any);
    mockPrisma.review.findMany.mockResolvedValue([{ id: "review-1" }] as any);
    mockPrisma.review.count.mockResolvedValue(1);

    const result = await UserService.getHostReviews("host-1", { page: 2, limit: 5 });

    expect(mockPrisma.review.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { property: { ownerId: "host-1", isActive: true } },
        skip: 5,
        take: 5,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          rating: true,
          comment: true,
          createdAt: true,
          hostReplyText: true,
          hostReplyCreatedAt: true,
          user: { select: { firstName: true, lastName: true, avatarUrl: true } },
          property: { select: { id: true, title: true } },
        },
      }),
    );
    expect(mockPrisma.review.count).toHaveBeenCalledWith({
      where: { property: { ownerId: "host-1", isActive: true } },
    });
    expect(result).toEqual({
      data: [{ id: "review-1" }],
      pagination: { page: 2, limit: 5, total: 1, totalPages: 1 },
    });
  });
});
