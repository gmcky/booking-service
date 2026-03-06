import { prisma } from "../../shared/lib/prisma.js";
import { AppError } from "../../shared/middlewares/error.handler.js";
import type { PaginationParams } from "../../shared/types/index.js";
import {
  calculatePagination,
  createPaginatedResponse,
} from "../../shared/utils/pagination.js";
import { omitUndefined } from "../../shared/utils/prisma.helpers.js";
import { imageQueue } from "../../shared/queues/image.queue.js";
import type {
  CreatePropertyInput,
  UpdatePropertyInput,
  PropertyFilters,
} from "./property.types.js";

/**
 * PropertyService - Core business logic for property listings.
 *
 * ARCHITECTURE ROADMAP:
 * - [Cache] Redis: Cache heavy search queries and single property lookups (Cache-Aside pattern).
 * - [Queue] BullMQ: Offload heavy tasks (image processing, notification emails) to background workers.
 * - [DB]    PostGIS: Future transition for complex geospatial queries (radius search).
 */
export class PropertyService {
  static async getAll(params: PaginationParams, filters: PropertyFilters) {
    const { skip, take } = calculatePagination(params.page, params.limit);

    // TODO [Cache]: Implement Redis caching for frequent search queries (Cache-Aside pattern).
    // 1. Generate a unique cache key from filters + pagination (e.g., `properties:search:${hash}`).
    // 2. Check Redis first. On hit -> return cached data immediately.
    // 3. On miss -> fetch from DB, store in Redis with a short TTL (5-10 min), then return.

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

    return createPaginatedResponse(properties, total, params);
  }

  static async getById(id: string) {
    // TODO [Cache]: Check Redis for `property:${id}` before hitting the DB.

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

    // TODO [Cache]: Populate Redis cache for `property:${id}` with a long TTL (e.g., 1 hour).

    return property;
  }

  static async create(data: CreatePropertyInput) {
    const { rawImagePaths, ...propertyData } = data;

    // Persist core listing data immediately — HTTP response is not blocked by image processing.
    const property = await prisma.property.create({
      data: {
        ...propertyData,
        images: [], // Populated asynchronously by the image processing worker.
        // isActive: false, // TODO: Uncomment to require admin approval before listing goes live.
      },
      include: {
        owner: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
    });

    // Offload image work to BullMQ: resize → WebP → S3 upload → DB update.
    // The client gets a 201 response immediately and images appear once the worker finishes.
    if (rawImagePaths.length > 0) {
      await imageQueue.add("process-images", {
        propertyId: property.id,
        rawImagePaths,
      });
    }

    // TODO [Queue]: BullMQ - Host Email Notification
    // Offload SMTP to a worker to keep HTTP response fast. Worker handles retries automatically.
    // await emailQueue.add('send-welcome-host', { email: property.owner.email, propertyName: property.title });

    // TODO [Cache]: Invalidate `properties:search:*` keys so the new listing appears in fresh queries.

    return property;
  }

  static async update(id: string, ownerId: string, data: UpdatePropertyInput) {
    await this.verifyOwnership(id, ownerId);

    const updated = await prisma.property.update({
      where: { id },
      data: omitUndefined(data),
    });

    // TODO [Cache]: Invalidate `property:${id}` and `properties:search:*` to prevent stale data.
    // await redisClient.del(`property:${id}`);

    return updated;
  }

  static async delete(id: string, ownerId: string) {
    await this.verifyOwnership(id, ownerId);

    // TODO [Queue]: BullMQ - S3 Cleanup
    // Enqueue a job to delete property images from S3 before removing the DB record.
    // Prevents orphaned files accumulating storage costs.
    // await cleanupQueue.add('delete-s3-images', { propertyId: id });

    await prisma.property.delete({ where: { id } });

    // TODO [Cache]: Invalidate `property:${id}` and `properties:search:*`.
  }

  static async setActive(id: string, ownerId: string, isActive: boolean) {
    await this.verifyOwnership(id, ownerId);

    const updated = await prisma.property.update({
      where: { id },
      data: { isActive },
    });

    // TODO [Cache]: Invalidate `property:${id}` and `properties:search:*`.

    return updated;
  }

  private static async verifyOwnership(propertyId: string, ownerId: string) {
    const property = await prisma.property.findUnique({
      where: { id: propertyId },
      select: { ownerId: true },
    });

    if (!property) {
      throw new AppError(404, "Property not found");
    }

    if (property.ownerId !== ownerId) {
      throw new AppError(403, "Not authorized to modify this property");
    }
  }
}
