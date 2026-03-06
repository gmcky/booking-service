import type { Request, Response } from "express";
import type { AuthenticatedRequest } from "../../shared/types/index.js";
import { getIdParam } from "../../shared/utils/request.helpers.js";
import { PropertyService } from "./property.service.js";
import { logger } from "../../shared/lib/logger.js";
import type { PropertyQueryInput } from "./property.types.js";

/**
 * Get all properties with filters and pagination
 * @route GET /api/v1/properties?page=1&limit=10&city=Berlin&type=APARTMENT&minPrice=50&maxPrice=200&maxGuests=4&amenities=WIFI,PARKING&sort=price_asc
 * @access Public
 */

export async function getProperties(req: Request, res: Response) {
  // req.query is already validated and parsed by validate(propertyQuerySchema, "query") in routes.
  const {
    page,
    limit,
    city,
    type,
    amenities,
    minPrice,
    maxPrice,
    maxGuests,
    sort,
  } = req.query as unknown as PropertyQueryInput;

  // TODO [Cache]: Implement Redis Cache-Aside here before calling the service.

  const result = await PropertyService.getAll(
    { page, limit },
    { city, type, amenities, minPrice, maxPrice, maxGuests, sort },
  );

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
