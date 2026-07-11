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
import { cacheGet, cacheSet } from "../../shared/lib/cache.js";
import { PropertyService } from "../../modules/properties/property.service.js";

const mockFindMany = prisma.property.findMany as unknown as ReturnType<typeof vi.fn>;
const mockCacheGet = cacheGet as unknown as ReturnType<typeof vi.fn>;
const mockCacheSet = cacheSet as unknown as ReturnType<typeof vi.fn>;

describe("PropertyService.getMapMarkers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCacheGet.mockResolvedValue(null);
    mockFindMany.mockResolvedValue([]);
  });

  it("returns the cached value without hitting the database on a cache hit", async () => {
    const cached = [{ id: "prop-1", title: "Cached", latitude: 52, longitude: 4 }];
    mockCacheGet.mockResolvedValue(cached);

    const result = await PropertyService.getMapMarkers({});

    expect(result).toBe(cached);
    expect(mockFindMany).not.toHaveBeenCalled();
  });

  it("queries prisma, caches, and returns markers on a cache miss", async () => {
    const markers = [{ id: "prop-1", title: "Loft", latitude: 52, longitude: 4 }];
    mockFindMany.mockResolvedValue(markers);

    const result = await PropertyService.getMapMarkers({
      minLat: 52,
      maxLat: 53,
      minLng: 4,
      maxLng: 5,
    });

    expect(result).toBe(markers);
    expect(mockCacheSet).toHaveBeenCalledWith(expect.any(String), markers, 5 * 60);

    const callArg = mockFindMany.mock.calls[0]?.[0];
    const andArg = callArg.where.AND;
    expect(andArg[0]).toEqual(
      expect.objectContaining({
        isActive: true,
        latitude: { gte: 52, lte: 53 },
        longitude: { gte: 4, lte: 5 },
      }),
    );
    expect(andArg[1]).toEqual({ latitude: { not: null }, longitude: { not: null } });
    expect(callArg.take).toBe(500);
    expect(callArg.orderBy).toEqual({ createdAt: "desc" });
    expect(callArg.select).toEqual({
      id: true,
      title: true,
      latitude: true,
      longitude: true,
      pricePerNight: true,
      averageRating: true,
      images: true,
    });
  });

  it("omits latitude/longitude range constraints when bbox filters are absent", async () => {
    await PropertyService.getMapMarkers({});

    const callArg = mockFindMany.mock.calls[0]?.[0];
    const andArg = callArg.where.AND;
    expect(andArg[0].latitude).toBeUndefined();
    expect(andArg[0].longitude).toBeUndefined();
    expect(andArg[1]).toEqual({ latitude: { not: null }, longitude: { not: null } });
  });
});
