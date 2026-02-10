import { prisma } from "../../shared/lib/prisma.js";
import { AppError } from "../../shared/middlewares/error.handler.js";
import { logger } from "../../shared/lib/logger.js";
import type { PaginationParams } from "../../shared/types/index.js";
import {
  calculatePagination,
  createPaginatedResponse,
} from "../../shared/utils/pagination.js";
import { omitUndefined } from "../../shared/utils/prisma.helpers.js";
import type {
  CreatePropertyInput,
  UpdatePropertyInput,
  PropertyFilters,
} from "./property.types.js";

// TODO: Implement full-text search for better property discovery
// Current filtering is basic (contains, price range)
// Upgrade to PostgreSQL full-text search or Elasticsearch
//
// Option 1: PostgreSQL FTS with tsvector
// - Add tsvector column to Property table
// - Create GIN index for fast search
// - Search across title, description, city, amenities
//
// Option 2: Elasticsearch integration (better for large scale)
// - Index properties in Elasticsearch on create/update
// - Support fuzzy matching, typo tolerance, relevance scoring
// - Add geospatial search (find properties near location)

// TODO: Add image upload handling
// import { uploadToS3 } from '../../shared/lib/storage.js';
// or use Cloudinary, Uploadcare, etc.
// Images should NOT be stored in database (use S3/CDN)

/**
 * PropertyService - Manages property listings
 *
 * IMPROVEMENTS NEEDED:
 * 1. Image upload to S3/Cloudinary with optimization
 * 2. Full-text search with filters (location, amenities, dates)
 * 3. Geospatial search (find properties within X km)
 * 4. Property verification workflow (admin approval)
 * 5. Average rating calculation based on reviews
 * 6. Featured/promoted properties logic
 */
export class PropertyService {
  static async getAll(params: PaginationParams, filters: PropertyFilters) {
    const { skip, take } = calculatePagination(params.page, params.limit);

    // TODO: Add date range availability filter
    // - Accept checkIn/checkOut dates as filters
    // - Filter out properties with overlapping bookings
    // - Requires complex subquery or JOIN with bookings table
    //
    // Example:
    // ...(filters.checkIn && filters.checkOut && {
    //   NOT: {
    //     bookings: {
    //       some: {
    //         status: { in: ['PENDING', 'CONFIRMED'] },
    //         OR: [
    //           { checkIn: { lte: filters.checkIn }, checkOut: { gt: filters.checkIn } },
    //           { checkIn: { lt: filters.checkOut }, checkOut: { gte: filters.checkOut } },
    //           { checkIn: { gte: filters.checkIn }, checkOut: { lte: filters.checkOut } }
    //         ]
    //       }
    //     }
    //   }
    // })

    // TODO: Add amenities filter (bathroom, kitchen, wifi, etc.)
    // Schema change required: Add amenities as JSON or separate table
    // Filter: amenities array CONTAINS all requested amenities

    // TODO: Add geospatial search (latitude, longitude, radius)
    // Requires PostGIS extension in PostgreSQL
    // Example: Find properties within 10km of (lat, lng)
    // WHERE ST_DWithin(location::geography, ST_MakePoint(lng, lat)::geography, 10000)

    const where = {
      isActive: true,
      ...(filters.city && {
        city: { contains: filters.city, mode: "insensitive" as const },
      }),
      ...(filters.type && { type: filters.type as any }), // Prisma enum type issue
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

    // TODO: Add sorting options (price, rating, recent, featured)
    // Default: Sort by createdAt desc (newest first)
    // Add query param: ?sort=price_asc|price_desc|rating|featured

    const [properties, total] = await Promise.all([
      prisma.property.findMany({
        where,
        skip,
        take,
        include: {
          owner: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
          // TODO: Include average rating from reviews
          // _count: {
          //   select: { reviews: true, bookings: true }
          // }
        },
      }),
      prisma.property.count({ where }),
    ]);

    // TODO: Add average rating to each property
    // Option 1: Calculate on-demand (slow for large datasets)
    // Option 2: Store in database, update via trigger/event (better)
    // const propertiesWithRatings = await Promise.all(
    //   properties.map(async (property) => {
    //     const avgRating = await prisma.review.aggregate({
    //       where: { propertyId: property.id },
    //       _avg: { rating: true }
    //     });
    //     return { ...property, avgRating: avgRating._avg.rating };
    //   })
    // );

    return createPaginatedResponse(properties, total, params);
  }

  static async getById(id: string) {
    const property = await prisma.property.findUnique({
      where: { id },
      include: {
        owner: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        reviews: {
          take: 5,
          orderBy: { createdAt: "desc" },
          include: {
            user: {
              select: {
                firstName: true,
                lastName: true,
              },
            },
          },
        },
      },
    });

    if (!property) {
      throw new AppError(404, "Property not found");
    }

    return property;
  }

  static async create(data: CreatePropertyInput) {
    // TODO: Validate property data (Zod schema in controller)
    // - title: min 10 chars, max 100 chars
    // - description: min 50 chars, max 2000 chars
    // - pricePerNight: positive number, reasonable range (e.g., 10-10000)
    // - maxGuests: 1-50
    // - images: array of valid URLs or file uploads

    // TODO: Handle image uploads
    // If images are file uploads (multipart/form-data):
    // 1. Validate file types (jpg, png, webp only)
    // 2. Validate file size (max 5MB per image, max 10 images)
    // 3. Resize/optimize images (generate thumbnails)
    // 4. Upload to S3/Cloudinary
    // 5. Store URLs in database
    //
    // import { uploadImages } from '../../shared/lib/storage.js';
    // const imageUrls = await uploadImages(files, {
    //   folder: `properties/${ownerId}`,
    //   maxSize: 5 * 1024 * 1024, // 5MB
    //   formats: ['jpg', 'png', 'webp'],
    //   resize: { width: 1200, height: 800, fit: 'cover' },
    //   generateThumbnail: true
    // });
    // data.images = imageUrls.map(url => url.secure_url);

    // TODO: Set initial status to PENDING (requires admin approval)
    // Add workflow: PENDING -> APPROVED -> ACTIVE
    // Only approved properties appear in search results

    return prisma.property.create({
      data,
      include: {
        owner: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    // TODO: Log property creation
    // logger.info({
    //   event: 'property_created',
    //   propertyId: property.id,
    //   ownerId: data.ownerId,
    //   city: data.city,
    //   pricePerNight: data.pricePerNight
    // }, 'New property listed');

    // TODO: Trigger background job for image optimization
    // await imageQueue.add('optimize-property-images', {
    //   propertyId: property.id,
    //   images: property.images
    // });

    // TODO: Send welcome email to property owner
    // await emailQueue.add('property-listed', {
    //   ownerId: data.ownerId,
    //   propertyId: property.id
    // });
  }

  static async update(id: string, ownerId: string, data: UpdatePropertyInput) {
    await this.verifyOwnership(id, ownerId);

    return prisma.property.update({
      where: { id },
      data: omitUndefined(data),
    });
  }

  static async delete(id: string, ownerId: string) {
    await this.verifyOwnership(id, ownerId);
    await prisma.property.delete({ where: { id } });
  }

  static async setActive(id: string, ownerId: string, isActive: boolean) {
    await this.verifyOwnership(id, ownerId);

    return prisma.property.update({
      where: { id },
      data: { isActive },
    });
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
