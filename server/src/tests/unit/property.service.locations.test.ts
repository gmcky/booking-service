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

const mockGroupBy = prisma.property.groupBy as unknown as ReturnType<typeof vi.fn>;
const mockCacheGet = cacheGet as unknown as ReturnType<typeof vi.fn>;
const mockCacheSet = cacheSet as unknown as ReturnType<typeof vi.fn>;

describe("PropertyService.getLocations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("folds groupBy rows into a tree sorted alphabetically at every level", async () => {
    mockCacheGet.mockResolvedValue(null);
    mockGroupBy.mockResolvedValue([
      { country: "Ukraine", city: "Lviv", district: "Old Town", _count: 2 },
      { country: "Ukraine", city: "Kyiv", district: "Podil", _count: 3 },
      { country: "Ukraine", city: "Kyiv", district: "Obolon", _count: 1 },
      { country: "France", city: "Paris", district: "Le Marais", _count: 4 },
    ]);

    const result = await PropertyService.getLocations();

    expect(result).toEqual([
      {
        country: "France",
        count: 4,
        cities: [
          {
            city: "Paris",
            count: 4,
            districts: [{ district: "Le Marais", count: 4 }],
          },
        ],
      },
      {
        country: "Ukraine",
        count: 6,
        cities: [
          {
            city: "Kyiv",
            count: 4,
            districts: [
              { district: "Obolon", count: 1 },
              { district: "Podil", count: 3 },
            ],
          },
          {
            city: "Lviv",
            count: 2,
            districts: [{ district: "Old Town", count: 2 }],
          },
        ],
      },
    ]);

    expect(mockGroupBy).toHaveBeenCalledWith({
      by: ["country", "city", "district"],
      where: { isActive: true },
      _count: true,
    });
  });

  it("excludes null districts from the districts array but still counts them at city level", async () => {
    mockCacheGet.mockResolvedValue(null);
    mockGroupBy.mockResolvedValue([
      { country: "Italy", city: "Rome", district: null, _count: 5 },
      { country: "Italy", city: "Rome", district: "Trastevere", _count: 2 },
    ]);

    const result = await PropertyService.getLocations();

    expect(result).toEqual([
      {
        country: "Italy",
        count: 7,
        cities: [
          {
            city: "Rome",
            count: 7,
            districts: [{ district: "Trastevere", count: 2 }],
          },
        ],
      },
    ]);
  });

  it("caches the folded tree for 5 minutes", async () => {
    mockCacheGet.mockResolvedValue(null);
    mockGroupBy.mockResolvedValue([
      { country: "Ukraine", city: "Kyiv", district: "Podil", _count: 1 },
    ]);

    await PropertyService.getLocations();

    expect(mockCacheSet).toHaveBeenCalledWith("properties:locations", expect.any(Array), 5 * 60);
  });

  it("returns the cached tree without querying prisma on a cache hit", async () => {
    const cachedTree = [{ country: "Ukraine", count: 1, cities: [] }];
    mockCacheGet.mockResolvedValue(cachedTree);

    const result = await PropertyService.getLocations();

    expect(result).toBe(cachedTree);
    expect(mockGroupBy).not.toHaveBeenCalled();
  });
});
