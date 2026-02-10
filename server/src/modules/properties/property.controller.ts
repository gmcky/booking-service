import type { Request, Response } from "express";
import type { AuthenticatedRequest } from "../../shared/types/index.js";
import { getIdParam } from "../../shared/utils/request.helpers.js";
import { PropertyService } from "./property.service.js";
import { logger } from "../../shared/lib/logger.js";

// TODO: Add validation middleware with Zod schemas
// Create schemas in property.validators.ts:
// - createPropertySchema: Validate all required fields
// - updatePropertySchema: Partial validation (only changed fields)
// - propertyFiltersSchema: Validate query parameters

/**
 * Get all properties with filters and pagination
 * @route GET /api/v1/properties?page=1&limit=10&city=Berlin&type=APARTMENT&minPrice=50&maxPrice=200&maxGuests=4
 * @access Public
 */

export async function getProperties(req: Request, res: Response) {
  // TODO: Validate and sanitize query parameters with Zod
  // Prevent SQL injection, validate data types
  // Example: price must be positive number, page must be integer

  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 10;

  // TODO: Add validation for limit (max 100 to prevent abuse)
  // if (limit > 100) throw new AppError(400, 'Max limit is 100');

  const filters = {
    city: req.query.city as string | undefined,
    type: req.query.type as string | undefined,
    minPrice: req.query.minPrice
      ? parseFloat(req.query.minPrice as string)
      : undefined,
    maxPrice: req.query.maxPrice
      ? parseFloat(req.query.maxPrice as string)
      : undefined,
    maxGuests: req.query.maxGuests
      ? parseInt(req.query.maxGuests as string)
      : undefined,
    // TODO: Add more filters
    // checkIn: req.query.checkIn ? new Date(req.query.checkIn as string) : undefined,
    // checkOut: req.query.checkOut ? new Date(req.query.checkOut as string) : undefined,
    // amenities: req.query.amenities ? (req.query.amenities as string).split(',') : undefined,
    // sortBy: req.query.sortBy as 'price_asc' | 'price_desc' | 'rating' | 'recent',
  };

  const result = await PropertyService.getAll({ page, limit }, filters);

  // TODO: Cache this response (Redis) for 5 minutes
  // Property list doesn't change frequently
  // Cache key: `properties:${page}:${limit}:${JSON.stringify(filters)}`

  res.json(result);
}

export async function getPropertyById(req: Request, res: Response) {
  const id = getIdParam(req);
  const property = await PropertyService.getById(id);
  res.json(property);
}

export async function createProperty(req: AuthenticatedRequest, res: Response) {
  // TODO: Validate user role - only HOSTS can create properties
  // if (req.user!.role !== 'HOST') {
  //   throw new AppError(403, 'Only hosts can create properties');
  // }

  const ownerId = req.user!.id;

  // TODO: Implement rate limiting - max 10 properties per day
  // Prevents spam listings

  // TODO: Handle multipart/form-data for im uploads
  // Use multer middleware:
  // import multer from 'multer';
  // const upload = multer({ storage: multer.memoryStorage() });
  // Route: router.post('/', authenticate, upload.array('images', 10), createProperty);
  // Access files: req.files

  // TODO: Validate request body with Zod (already in middleware)
  // Body validation should include:
  // - title, description, address, city, country
  // - type (APARTMENT, HOUSE, etc.)
  // - pricePerNight, maxGuests
  // - amenities array (optional)

  const property = await PropertyService.create({ ...req.body, ownerId });

  // TODO: Log property creation
  // logger.info({
  //   event: 'property_created',
  //   propertyId: property.id,
  //   ownerId,
  //   city: property.city
  // }, 'New property created');

  res.status(201).json(property);
}

export async function updateProperty(req: AuthenticatedRequest, res: Response) {
  const id = getIdParam(req);
  const ownerId = req.user!.id;
  const property = await PropertyService.update(id, ownerId, req.body);
  res.json(property);
}

export async function deleteProperty(req: AuthenticatedRequest, res: Response) {
  const id = getIdParam(req);
  const ownerId = req.user!.id;
  await PropertyService.delete(id, ownerId);
  res.status(204).send();
}

export async function activateProperty(
  req: AuthenticatedRequest,
  res: Response,
) {
  const id = getIdParam(req);
  const ownerId = req.user!.id;
  const property = await PropertyService.setActive(id, ownerId, true);
  res.json(property);
}

export async function deactivateProperty(
  req: AuthenticatedRequest,
  res: Response,
) {
  const id = getIdParam(req);
  const ownerId = req.user!.id;
  const property = await PropertyService.setActive(id, ownerId, false);
  res.json(property);
}
