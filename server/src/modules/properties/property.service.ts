import { prisma } from "../../shared/lib/prisma.js";
import { AppError } from "../../shared/middlewares/error.handler.js";
import type { PaginationParams } from "../../shared/types/index.js";
import {
  calculatePagination,
  createPaginatedResponse,
} from "../../shared/utils/pagination.js";
import { omitUndefined } from "../../shared/utils/prisma.helpers.js";
import { imageQueue } from "../../shared/queues/image.queue.js";
import { emailQueue } from "../../shared/queues/email.queue.js";
import {
  cleanupQueue,
  type CleanupJobName,
} from "../../shared/queues/cleanup.queue.js";
import {
  cacheGet,
  cacheSet,
  cacheDel,
  cacheInvalidatePattern,
  hashKey,
} from "../../shared/lib/cache.js";
import type {
  CreatePropertyInput,
  UpdatePropertyInput,
  PropertyFilters,
} from "./property.types.js";

/**
 * Core business logic for property listings.
 *
 * Architecture roadmap:
 * - Cache: Redis cache-aside for search and property lookups.
 * - Queue: BullMQ for background image processing and notifications.
 * - Database: optional PostGIS migration for geospatial queries.
 */
export class PropertyService {
  static async getAll(params: PaginationParams, filters: PropertyFilters) {
    const { skip, take } = calculatePagination(params.page, params.limit);

    const cacheKey = `properties:search:${hashKey({ params, filters })}`;
    const cached = await cacheGet(cacheKey);
    if (cached) return cached;

    const where = {
      isActive: true,
      ...(filters.city && {
        city: { contains: filters.city, mode: "insensitive" as const },
      }),
      ...(filters.type && { type: filters.type as any }),
      ...(filters.amenities?.length && {
        amenities: { hasEvery: filters.amenities },
      }),
      ...(filters.minPrice !== undefined && filters.maxPrice !== undefined
        ? { pricePerNight: { gte: filters.minPrice, lte: filters.maxPrice } }
        : filters.minPrice !== undefined
          ? { pricePerNight: { gte: filters.minPrice } }
          : filters.maxPrice !== undefined
            ? { pricePerNight: { lte: filters.maxPrice } }
            : {}),
      ...(filters.maxGuests !== undefined && {
        maxGuests: { gte: filters.maxGuests },
      }),
    };

    const sortMap = {
      price_asc: { pricePerNight: "asc" as const },
      price_desc: { pricePerNight: "desc" as const },
      newest: { createdAt: "desc" as const },
    };
    const orderBy = sortMap[filters.sort ?? "newest"];

    const [properties, total] = await Promise.all([
      prisma.property.findMany({
        where,
        skip,
        take,
        orderBy,
        include: {
          owner: {
            select: { id: true, firstName: true, lastName: true },
          },
        },
      }),
      prisma.property.count({ where }),
    ]);

    const result = createPaginatedResponse(properties, total, params);
    await cacheSet(cacheKey, result, 5 * 60);
    return result;
  }

  static async getById(id: string) {
    const cacheKey = `property:${id}`;
    const cached = await cacheGet(cacheKey);
    if (cached) return cached;

    const property = await prisma.property.findUnique({
      where: { id },
      include: {
        owner: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        reviews: {
          take: 5,
          orderBy: { createdAt: "desc" },
          include: {
            user: { select: { firstName: true, lastName: true } },
          },
        },
      },
    });

    if (!property) {
      throw new AppError(404, "Property not found");
    }

    await cacheSet(cacheKey, property, 60 * 60);
    return property;
  }

  static async create(data: CreatePropertyInput) {
    const { rawImagePaths, ...propertyData } = data;

    // Persist listing data immediately; image processing is asynchronous.
    // TODO: Add configurable moderation workflow for new listings.
    const property = await prisma.property.create({
      data: {
        ...propertyData,
        images: [],
      },
      include: {
        owner: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    });

    // Offload image processing to background workers to keep API latency low.
    if (rawImagePaths.length > 0) {
      await imageQueue.add("process-images", {
        propertyId: property.id,
        rawImagePaths,
      });
    }

    // Send host notification asynchronously via email worker.
    await emailQueue.add("property-created-host", {
      ownerEmail: property.owner.email!,
      ownerFirstName: property.owner.firstName,
      propertyId: property.id,
      propertyTitle: property.title,
    });

    await cacheInvalidatePattern("properties:search:*");

    return property;
  }

  static async update(id: string, ownerId: string, data: UpdatePropertyInput) {
    const current = await this.verifyOwnership(id, ownerId);

    const updated = await prisma.property.update({
      where: { id },
      data: omitUndefined(data),
    });

    // Cleanup is triggered only when images are explicitly provided by caller.
    // An empty array intentionally marks all previous images as orphaned.
    if (data.images !== undefined) {
      const incoming = new Set(data.images);
      const orphaned = current.images.filter((p) => !incoming.has(p));

      if (orphaned.length > 0) {
        const jobName: CleanupJobName = "unlink-property-images";
        await cleanupQueue.add(jobName, { paths: orphaned });
      }
    }

    await Promise.all([
      cacheDel(`property:${id}`),
      cacheInvalidatePattern("properties:search:*"),
    ]);

    return updated;
  }

  static async delete(id: string, ownerId: string) {
    const property = await this.verifyOwnership(id, ownerId);

    await prisma.property.delete({ where: { id } });

    if (property.images.length > 0) {
      const jobName: CleanupJobName = "unlink-property-images";
      await cleanupQueue.add(jobName, { paths: property.images });
    }

    await Promise.all([
      cacheDel(`property:${id}`),
      cacheInvalidatePattern("properties:search:*"),
    ]);
  }

  static async setActive(id: string, ownerId: string, isActive: boolean) {
    await this.verifyOwnership(id, ownerId);

    const updated = await prisma.property.update({
      where: { id },
      data: { isActive },
    });

    await Promise.all([
      cacheDel(`property:${id}`),
      cacheInvalidatePattern("properties:search:*"),
    ]);

    return updated;
  }

  private static async verifyOwnership(propertyId: string, ownerId: string) {
    const property = await prisma.property.findUnique({
      where: { id: propertyId },
      select: { ownerId: true, images: true },
    });

    if (!property) {
      throw new AppError(404, "Property not found");
    }

    if (property.ownerId !== ownerId) {
      throw new AppError(403, "Not authorized to modify this property");
    }

    return property;
  }
}
