import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockDeep, mockReset, type DeepMockProxy } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";

vi.mock("../../shared/lib/prisma.js", () => ({
  prisma: mockDeep<PrismaClient>(),
}));

import { prisma } from "../../shared/lib/prisma.js";
import { FavoriteService } from "../../modules/favorites/favorite.service.js";

const mockPrisma = prisma as unknown as DeepMockProxy<PrismaClient>;

describe("FavoriteService", () => {
  beforeEach(() => {
    mockReset(mockPrisma);
    vi.clearAllMocks();
  });

  describe("add", () => {
    it("creates a favorite for an active property", async () => {
      mockPrisma.property.findUnique.mockResolvedValue({
        id: "property-1",
        isActive: true,
      } as any);

      mockPrisma.favorite.upsert.mockResolvedValue({
        id: "favorite-1",
        userId: "user-1",
        propertyId: "property-1",
        createdAt: new Date(),
        property: { id: "property-1" },
      } as any);

      const favorite = await FavoriteService.add("user-1", "property-1");

      expect(favorite.id).toBe("favorite-1");
      expect(mockPrisma.favorite.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId_propertyId: { userId: "user-1", propertyId: "property-1" } },
          create: { userId: "user-1", propertyId: "property-1" },
          update: {},
        }),
      );
    });

    it("throws 404 when property does not exist", async () => {
      mockPrisma.property.findUnique.mockResolvedValue(null);

      await expect(FavoriteService.add("user-1", "missing-property")).rejects.toMatchObject({
        statusCode: 404,
        message: "Property not found",
      });

      expect(mockPrisma.favorite.upsert).not.toHaveBeenCalled();
    });

    it("throws 404 when property is inactive", async () => {
      mockPrisma.property.findUnique.mockResolvedValue({
        id: "property-1",
        isActive: false,
      } as any);

      await expect(FavoriteService.add("user-1", "property-1")).rejects.toMatchObject({
        statusCode: 404,
        message: "Property not found",
      });

      expect(mockPrisma.favorite.upsert).not.toHaveBeenCalled();
    });

    it("returns the existing favorite on a duplicate add without throwing", async () => {
      mockPrisma.property.findUnique.mockResolvedValue({
        id: "property-1",
        isActive: true,
      } as any);

      const existing = {
        id: "favorite-1",
        userId: "user-1",
        propertyId: "property-1",
        createdAt: new Date(),
        property: { id: "property-1" },
      };
      mockPrisma.favorite.upsert.mockResolvedValue(existing as any);

      const first = await FavoriteService.add("user-1", "property-1");
      const second = await FavoriteService.add("user-1", "property-1");

      expect(first).toEqual(existing);
      expect(second).toEqual(existing);
    });
  });

  describe("remove", () => {
    it("deletes via deleteMany regardless of whether the favorite exists", async () => {
      mockPrisma.favorite.deleteMany.mockResolvedValue({ count: 0 } as any);

      await expect(FavoriteService.remove("user-1", "never-favorited")).resolves.toBeUndefined();

      expect(mockPrisma.favorite.deleteMany).toHaveBeenCalledWith({
        where: { userId: "user-1", propertyId: "never-favorited" },
      });
    });
  });

  describe("list", () => {
    it("paginates favorites for the user, newest first", async () => {
      mockPrisma.favorite.findMany.mockResolvedValue([
        { id: "favorite-1", userId: "user-1", propertyId: "property-1" },
      ] as any);
      mockPrisma.favorite.count.mockResolvedValue(21);

      const result = await FavoriteService.list("user-1", { page: 2, limit: 10 });

      expect(mockPrisma.favorite.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: "user-1" },
          skip: 10,
          take: 10,
          orderBy: { createdAt: "desc" },
          include: { property: true },
        }),
      );
      expect(result.pagination).toEqual({
        page: 2,
        limit: 10,
        total: 21,
        totalPages: 3,
      });
      expect(result.data).toHaveLength(1);
    });
  });

  describe("listIds", () => {
    it("returns all favorited propertyIds unpaginated", async () => {
      mockPrisma.favorite.findMany.mockResolvedValue([
        { propertyId: "property-1" },
        { propertyId: "property-2" },
      ] as any);

      const result = await FavoriteService.listIds("user-1");

      expect(result).toEqual({ ids: ["property-1", "property-2"] });
      expect(mockPrisma.favorite.findMany).toHaveBeenCalledWith({
        where: { userId: "user-1" },
        select: { propertyId: true },
      });
    });
  });
});
