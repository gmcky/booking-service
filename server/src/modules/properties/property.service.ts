import { prisma } from "../../shared/lib/prisma.js";
import prismaClientPkg from "@prisma/client";
const { BookingStatus } = prismaClientPkg;
import { AppError } from "../../shared/middlewares/error.handler.js";
import { logger } from "../../shared/lib/logger.js";
import type { PaginationParams } from "../../shared/types/index.js";
import { calculatePagination, createPaginatedResponse } from "../../shared/utils/pagination.js";
import { omitUndefined } from "../../shared/utils/prisma.helpers.js";
import { imageQueue } from "../../shared/queues/image.queue.js";
import { randomUUID } from "crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
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

// Raw uploads are worker input only — never publicly served.
const RAW_UPLOAD_PREFIX = "uploads/property-temp/";
// Orphaned raw uploads are reaped after this window.
const RAW_UPLOAD_TTL_MS = 24 * 60 * 60 * 1000;

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
      ...(filters.country && {
        country: { contains: filters.country, mode: "insensitive" as const },
      }),
      ...(filters.district && {
        district: { contains: filters.district, mode: "insensitive" as const },
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

  /**
   * Public location facets — country/city/district counts for active
   * listings, folded into a sorted tree. Cached under a fixed key since it
   * has no per-request variance; invalidated alongside the search cache.
   */
  static async getLocations() {
    const cacheKey = "properties:locations";
    const cached = await cacheGet(cacheKey);
    if (cached) return cached;

    const rows = await prisma.property.groupBy({
      by: ["country", "city", "district"],
      where: { isActive: true },
      _count: true,
    });

    type CountryNode = { count: number; cities: Map<string, CityNode> };
    type CityNode = { count: number; districts: Map<string, number> };

    const countries = new Map<string, CountryNode>();

    for (const row of rows) {
      const count =
        typeof row._count === "number" ? row._count : (row._count as { _all: number })._all;

      let countryNode = countries.get(row.country);
      if (!countryNode) {
        countryNode = { count: 0, cities: new Map() };
        countries.set(row.country, countryNode);
      }
      countryNode.count += count;

      let cityNode = countryNode.cities.get(row.city);
      if (!cityNode) {
        cityNode = { count: 0, districts: new Map() };
        countryNode.cities.set(row.city, cityNode);
      }
      cityNode.count += count;

      if (row.district) {
        cityNode.districts.set(row.district, (cityNode.districts.get(row.district) ?? 0) + count);
      }
    }

    const tree = Array.from(countries.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([country, countryNode]) => ({
        country,
        count: countryNode.count,
        cities: Array.from(countryNode.cities.entries())
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([city, cityNode]) => ({
            city,
            count: cityNode.count,
            districts: Array.from(cityNode.districts.entries())
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([district, count]) => ({ district, count })),
          })),
      }));

    await cacheSet(cacheKey, tree, 5 * 60);
    return tree;
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

  /**
   * Writes raw multipart uploads to disk; returns relative paths for
   * rawImagePaths on create/update. Raw bytes stay on local disk as worker
   * input and are never public — only processed WebP goes to object storage.
   */
  static async saveRawImages(userId: string, files: Express.Multer.File[]): Promise<string[]> {
    const paths: string[] = [];

    for (const file of files) {
      const relPath = `${RAW_UPLOAD_PREFIX}${userId}-${randomUUID()}`;
      const absPath = resolve(process.cwd(), relPath);
      await mkdir(dirname(absPath), { recursive: true });
      await writeFile(absPath, file.buffer);
      paths.push(relPath);
    }

    // Orphan reaper: if these are never attached to a property the delayed
    // job unlinks them; already-processed files are ENOENT no-ops.
    if (paths.length > 0) {
      await cleanupQueue.add("unlink-property-images", { paths }, { delay: RAW_UPLOAD_TTL_MS });
    }

    logger.info({ userId, count: paths.length }, "Raw property images saved");

    return paths;
  }

  /**
   * Persist listing and fan out async image/notification jobs.
   */
  static async create(data: CreatePropertyInput) {
    const { rawImagePaths, ...propertyData } = data;

    // rawImagePaths may only reference the caller's own uploads — the worker
    // guards against escaping uploads/, not against cross-tenant reuse.
    const ownedPrefix = `${RAW_UPLOAD_PREFIX}${data.ownerId}-`;
    if (rawImagePaths.some((p) => !p.startsWith(ownedPrefix))) {
      throw new AppError(400, "Invalid image path");
    }

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

    await Promise.all([
      cacheInvalidateNamespace("properties:search"),
      cacheDel("properties:locations"),
    ]);

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

    await Promise.all([
      cacheDel(`property:${id}`),
      cacheInvalidateNamespace("properties:search"),
      cacheDel("properties:locations"),
    ]);

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
      cacheDel("properties:locations"),
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
      cacheDel("properties:locations"),
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
