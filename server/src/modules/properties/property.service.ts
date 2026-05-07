import { prisma } from "../../shared/lib/prisma.js";
import { BookingStatus } from "@prisma/client";
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

/** Listing lifecycle service with cache-aside and async queue side-effects. */
export class PropertyService {
  /** Public search flow: filter/sort/paginate with short-lived cache. */
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
      // Search is advisory — actual booking creation re-checks under Serializable tx.
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

  /** Read flow: public view is cached; inactive listings are visible only to owner/admin. */
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

    const canViewInactive =
      viewer?.role === "ADMIN" || viewer?.id === property.ownerId;

    if (!property.isActive && !canViewInactive) {
      throw new AppError(404, "Property not found");
    }

    // Cache only publicly visible state to avoid leaking owner/admin-only access.
    if (property.isActive) {
      await cacheSet(cacheKey, property, 60 * 60);
    }

    return property;
  }

  /** Create flow: persist listing first, then fan out async jobs. */
  static async create(data: CreatePropertyInput) {
    const { rawImagePaths, ...propertyData } = data;

    // TODO: add configurable listing moderation.
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

    // Image work is async to avoid request-path latency spikes.
    if (rawImagePaths.length > 0) {
      await imageQueue.add("process-images", {
        type: "property",
        propertyId: property.id,
        rawImagePaths,
      });
    }

    // Notification enqueue is fire-and-forget.
    await emailQueue.add("property-created-host", {
      ownerEmail: property.owner.email,
      ownerFirstName: property.owner.firstName,
      propertyId: property.id,
      propertyTitle: property.title,
    });

    await cacheInvalidatePattern("properties:search:*");

    const { owner: { email: _email, ...ownerWithoutEmail }, ...propertyWithoutOwner } = property;
    return { ...propertyWithoutOwner, owner: ownerWithoutEmail };
  }

  /** Update flow: ownership-guarded patch with orphan-image cleanup. */
  static async update(id: string, ownerId: string, data: UpdatePropertyInput) {
    const current = await this.verifyOwnership(id, ownerId);

    const updated = await prisma.property.update({
      where: { id },
      data: omitUndefined(data),
    });

    // `images: []` is explicit orphaning intent; trigger cleanup.
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

  /** Delete flow: ownership check + soft-delete by deactivation. */
  static async delete(id: string, ownerId: string) {
    await this.verifyOwnership(id, ownerId);

    const activeBookingsCount = await prisma.booking.count({
      where: {
        propertyId: id,
        status: { in: ["PENDING", "CONFIRMED"] },
      },
    });

    if (activeBookingsCount > 0) {
      throw new AppError(
        400,
        "Cannot delete property with active bookings. Cancel them first.",
      );
    }

    await prisma.property.update({
      where: { id },
      data: { isActive: false },
    });

    await Promise.all([
      cacheDel(`property:${id}`),
      cacheInvalidatePattern("properties:search:*"),
      invalidateUserStatsCache(ownerId),
    ]);
  }

  /** Toggle listing visibility and invalidate read/search caches. */
  static async setActive(id: string, ownerId: string, isActive: boolean) {
    await this.verifyOwnership(id, ownerId);

    const updated = await prisma.property.update({
      where: { id },
      data: { isActive },
    });

    await Promise.all([
      cacheDel(`property:${id}`),
      cacheInvalidatePattern("properties:search:*"),
      invalidateUserStatsCache(ownerId),
    ]);

    return updated;
  }

  /** Ownership guard used by all mutating listing operations. */
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
