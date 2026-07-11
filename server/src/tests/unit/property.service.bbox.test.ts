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

vi.mock("../../shared/queues/geocode.queue.js", () => ({
  geocodeQueue: { add: vi.fn().mockResolvedValue(undefined) },
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

describe("PropertyService.getAll bounding box filter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCacheGet.mockResolvedValue(null);
    mockFindMany.mockResolvedValue([]);
    mockCount.mockResolvedValue(0);
  });

  it("adds latitude/longitude range filters when the full bbox is provided", async () => {
    await PropertyService.getAll(
      { page: 1, limit: 10 },
      { minLat: 52, maxLat: 53, minLng: 4, maxLng: 5 },
    );

    const whereArg = mockFindMany.mock.calls[0]?.[0]?.where;
    expect(whereArg.latitude).toEqual({ gte: 52, lte: 53 });
    expect(whereArg.longitude).toEqual({ gte: 4, lte: 5 });
  });

  it("omits latitude/longitude filters when bbox is absent", async () => {
    await PropertyService.getAll({ page: 1, limit: 10 }, {});

    const whereArg = mockFindMany.mock.calls[0]?.[0]?.where;
    expect(whereArg.latitude).toBeUndefined();
    expect(whereArg.longitude).toBeUndefined();
  });

  it("omits latitude/longitude filters when bbox is only partially provided", async () => {
    await PropertyService.getAll({ page: 1, limit: 10 }, { minLat: 52, maxLat: 53 });

    const whereArg = mockFindMany.mock.calls[0]?.[0]?.where;
    expect(whereArg.latitude).toBeUndefined();
    expect(whereArg.longitude).toBeUndefined();
  });
});
