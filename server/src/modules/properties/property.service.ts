import { prisma } from "../../shared/lib/prisma.js";
import { BookingStatus } from "@prisma/client";
import { AppError } from "../../shared/middlewares/error.handler.js";
import type { PaginationParams } from "../../shared/types/index.js";
import { calculatePagination, createPaginatedResponse } from "../../shared/utils/pagination.js";
import { omitUndefined } from "../../shared/utils/prisma.helpers.js";
import { imageQueue } from "../../shared/queues/image.queue.js";
import { emailQueue } from "../../shared/queues/email.queue.js";
import { cleanupQueue, type CleanupJobName } from "../../shared/queues/cleanup.queue.js";
import {
  cacheGet,
  cacheSet,
  cacheDel,
  cacheGetNamespaceVersion,
  cacheInvalidateNamespace,
  hashKey,
} from "../../shared/lib/cache.js";
import { invalidateUserStatsCache } from "../users/user.stats.cache.js";
import type {
  CreatePropertyInput,
  UpdatePropertyInput,
  PropertyFilters,
} from "./property.types.js";

type PropertyViewer = {
  id: string;
  role: string;
};

export class PropertyService {
  /**
   * Filtered search with short-lived cache-aside.
   */
  static async getAll(params: PaginationParams, filters: PropertyFilters) {
    const { skip, take } = calculatePagination(params.page, params.limit);

    const ver = await cacheGetNamespaceVersion("properties:search");
    const cacheKey = `properties:search:v${ver}:${hashKey({ params, filters })}`;
    const cached = await cacheGet(cacheKey);
    if (cached) return cached;

    const where = {
      isActive: true,
      ...(filters.city && {
        city: { contains: filters.city, mode: "insensitive" as const },
      }),
      ...(filters.type && { type: filters.type }),
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
      // Advisory availability — final check performed under Serializable tx during booking.
      ...(filters.checkIn &&
        filters.checkOut && {
          NOT: [
            {
              bookings: {
                some: {
                  status: { in: [BookingStatus.PENDING, BookingStatus.CONFIRMED] },
                  checkIn: { lt: filters.checkOut },
                  checkOut: { gt: filters.checkIn },
                },
              },
            },
            {
              blockedDates: {
                some: {
                  startDate: { lt: filters.checkOut },
                  endDate: { gt: filters.checkIn },
                },
              },
            },
          ],
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

  static async getMyProperties(ownerId: string, params: PaginationParams) {
    const { skip, take } = calculatePagination(params.page, params.limit);

    const [properties, total] = await Promise.all([
      prisma.property.findMany({
        where: { ownerId },
        skip,
        take,
        orderBy: { createdAt: "desc" },
      }),
      prisma.property.count({ where: { ownerId } }),
    ]);

    return createPaginatedResponse(properties, total, params);
  }

  /**
   * Cached public view; inactive listings restricted to owner/admin.
   */
  static async getById(id: string, viewer?: PropertyViewer) {
    const cacheKey = `property:${id}`;
    const cached = await cacheGet(cacheKey);
    if (cached) return cached;

    const property = await prisma.property.findUnique({
      where: { id },
      include: {
        owner: {
          select: { id: true, firstName: true, lastName: true },
        },
        reviews: {
          take: 5,
          orderBy: { createdAt: "desc" },
          include: {
            user: { select: { firstName: true, lastName: true } },
            hostReplyBy: { select: { firstName: true, lastName: true } },
          },
        },
      },
    });

    if (!property) {
      throw new AppError(404, "Property not found");
    }

    const canViewInactive = viewer?.role === "ADMIN" || viewer?.id === property.ownerId;

    if (!property.isActive && !canViewInactive) {
      throw new AppError(404, "Property not found");
    }

    // Avoid leaking restricted access state to public cache.
    if (property.isActive) {
      await cacheSet(cacheKey, property, 60 * 60);
    }

    return property;
  }

  // TODO:   add configurable listing moderation.
  /**
   * Persist listing and fan out async image/notification jobs.
   */
  static async create(data: CreatePropertyInput) {
    const { rawImagePaths, ...propertyData } = data;

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

    // Async processing to avoid request-path latency.
    if (rawImagePaths.length > 0) {
      await imageQueue.add("process-images", {
        type: "property",
        propertyId: property.id,
        rawImagePaths,
      });
    }

    await emailQueue.add("property-created-host", {
      ownerEmail: property.owner.email,
      ownerFirstName: property.owner.firstName,
      propertyId: property.id,
      propertyTitle: property.title,
    });

    await cacheInvalidateNamespace("properties:search");

    const {
      owner: { email: _email, ...ownerWithoutEmail },
      ...propertyWithoutOwner
    } = property;
    return { ...propertyWithoutOwner, owner: ownerWithoutEmail };
  }

  /**
   * Ownership-guarded patch with orphan-image cleanup.
   */
  static async update(id: string, ownerId: string, data: UpdatePropertyInput) {
    const current = await this.verifyOwnership(id, ownerId);

    const updated = await prisma.property.update({
      where: { id },
      data: omitUndefined(data),
    });

    // Explicit orphaning triggers cleanup job.
    if (data.images !== undefined) {
      const incoming = new Set(data.images);
      const orphaned = current.images.filter((p) => !incoming.has(p));

      if (orphaned.length > 0) {
        const jobName: CleanupJobName = "unlink-property-images";
        await cleanupQueue.add(jobName, { paths: orphaned });
      }
    }

    await Promise.all([cacheDel(`property:${id}`), cacheInvalidateNamespace("properties:search")]);

    return updated;
  }

  /**
   * Soft-delete via deactivation; blocks if active bookings exist.
   */
  static async delete(id: string, ownerId: string) {
    await this.verifyOwnership(id, ownerId);

    const activeBookingsCount = await prisma.booking.count({
      where: {
        propertyId: id,
        status: { in: ["PENDING", "CONFIRMED"] },
      },
    });

    if (activeBookingsCount > 0) {
      throw new AppError(400, "Cannot delete property with active bookings. Cancel them first.");
    }

    await prisma.property.update({
      where: { id },
      data: { isActive: false },
    });

    await Promise.all([
      cacheDel(`property:${id}`),
      cacheInvalidateNamespace("properties:search"),
      invalidateUserStatsCache(ownerId),
    ]);
  }

  /**
   * Toggle visibility and invalidate related caches.
   */
  static async setActive(id: string, ownerId: string, isActive: boolean) {
    await this.verifyOwnership(id, ownerId);

    const updated = await prisma.property.update({
      where: { id },
      data: { isActive },
    });

    await Promise.all([
      cacheDel(`property:${id}`),
      cacheInvalidateNamespace("properties:search"),
      invalidateUserStatsCache(ownerId),
    ]);

    return updated;
  }

  /**
   * Ownership guard for mutating operations.
   */
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
