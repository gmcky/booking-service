import { prisma } from "../../shared/lib/prisma.js";
import { logger } from "../../shared/lib/logger.js";
import { AppError } from "../../shared/middlewares/error.handler.js";
import type { PaginationParams } from "../../shared/types/index.js";
import { calculatePagination, createPaginatedResponse } from "../../shared/utils/pagination.js";

export class FavoriteService {
  /**
   * Idempotent add — upsert on the composite unique so a repeat POST
   * returns the existing favorite instead of throwing.
   */
  static async add(userId: string, propertyId: string) {
    const property = await prisma.property.findUnique({
      where: { id: propertyId },
      select: { id: true, isActive: true },
    });

    if (!property || !property.isActive) {
      throw new AppError(404, "Property not found");
    }

    const favorite = await prisma.favorite.upsert({
      where: { userId_propertyId: { userId, propertyId } },
      create: { userId, propertyId },
      update: {},
      include: { property: true },
    });

    logger.info({ event: "favorite_added", userId, propertyId }, "Property favorited");

    return favorite;
  }

  /**
   * Idempotent remove — deleteMany so a missing favorite is a no-op,
   * matching optimistic client UI (no 404 needed).
   */
  static async remove(userId: string, propertyId: string) {
    await prisma.favorite.deleteMany({ where: { userId, propertyId } });

    logger.info({ event: "favorite_removed", userId, propertyId }, "Property unfavorited");
  }

  /**
   * Paginated favorites, newest first, with the full property record
   * (same shape the property list/detail endpoints return) for cards.
   */
  static async list(userId: string, params: PaginationParams) {
    const { skip, take } = calculatePagination(params.page, params.limit);

    // Exclude delisted properties — their detail pages 404 for non-owners.
    const where = { userId, property: { isActive: true } };

    const [favorites, total] = await Promise.all([
      prisma.favorite.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: "desc" },
        include: { property: true },
      }),
      prisma.favorite.count({ where }),
    ]);

    return createPaginatedResponse(favorites, total, params);
  }

  /**
   * All favorited propertyIds, unpaginated — used to hydrate heart state
   * across a list of properties in a single request.
   */
  static async listIds(userId: string) {
    const favorites = await prisma.favorite.findMany({
      where: { userId, property: { isActive: true } },
      select: { propertyId: true },
    });

    return { ids: favorites.map((favorite) => favorite.propertyId) };
  }
}
