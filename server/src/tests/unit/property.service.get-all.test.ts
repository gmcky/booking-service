import { describe, it, expect, beforeEach, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { mockDeep } from "vitest-mock-extended";

vi.mock("../../shared/lib/prisma.js", () => ({
  prisma: mockDeep<PrismaClient>(),
}));

vi.mock("../../shared/lib/cache.js", () => ({
  cacheGet: vi.fn(),
  cacheSet: vi.fn(),
  cacheDel: vi.fn(),
  cacheGetNamespaceVersion: vi.fn().mockResolvedValue("0"),
  cacheInvalidateNamespace: vi.fn(),
  hashKey: vi.fn(() => "hash"),
}));

vi.mock("../../shared/queues/image.queue.js", () => ({
  imageQueue: { add: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock("../../shared/queues/email.queue.js", () => ({
  emailQueue: { add: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock("../../shared/queues/cleanup.queue.js", () => ({
  cleanupQueue: { add: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock("../../modules/users/user.stats.cache.js", () => ({
  invalidateUserStatsCache: vi.fn().mockResolvedValue(undefined),
}));

import { prisma } from "../../shared/lib/prisma.js";
import { cacheGet } from "../../shared/lib/cache.js";
import { PropertyService } from "../../modules/properties/property.service.js";

const mockFindMany = prisma.property.findMany as unknown as ReturnType<typeof vi.fn>;
const mockCount = prisma.property.count as unknown as ReturnType<typeof vi.fn>;
const mockCacheGet = cacheGet as unknown as ReturnType<typeof vi.fn>;

describe("PropertyService.getAll location filters", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCacheGet.mockResolvedValue(null);
    mockFindMany.mockResolvedValue([]);
    mockCount.mockResolvedValue(0);
  });

  it("adds country and district as insensitive-contains filters when provided", async () => {
    await PropertyService.getAll({ page: 1, limit: 10 }, { country: "Ukraine", district: "Podil" });

    const whereArg = mockFindMany.mock.calls[0]?.[0]?.where;
    expect(whereArg.country).toEqual({ contains: "Ukraine", mode: "insensitive" });
    expect(whereArg.district).toEqual({ contains: "Podil", mode: "insensitive" });
  });

  it("omits country and district from the where clause when absent", async () => {
    await PropertyService.getAll({ page: 1, limit: 10 }, {});

    const whereArg = mockFindMany.mock.calls[0]?.[0]?.where;
    expect(whereArg.country).toBeUndefined();
    expect(whereArg.district).toBeUndefined();
  });
});
