import type { Request, Response } from "express";
import type { AuthenticatedRequest } from "../../shared/types/index.js";
import { getIdParam } from "../../shared/utils/request.helpers.js";
import { PropertyService } from "./property.service.js";
import type { PropertyQueryInput } from "./property.types.js";

/**
 * @route GET /api/v1/properties?page=1&limit=10&city=Berlin&type=APARTMENT&minPrice=50&maxPrice=200&maxGuests=4&amenities=WIFI,PARKING&sort=price_asc
 * @access Public
 */
export async function getProperties(req: Request, res: Response) {
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

  // TODO: add controller cache-aside if service cache is removed.

  const result = await PropertyService.getAll(
    { page, limit },
    { city, type, amenities, minPrice, maxPrice, maxGuests, sort },
  );

  res.json(result);
}

/**
 * @route GET /api/v1/properties/my
 * @access Private
 * @security Bearer token required.
 */
export async function getMyProperties(req: AuthenticatedRequest, res: Response) {
  const ownerId = req.user!.id;
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 10;
  const result = await PropertyService.getMyProperties(ownerId, { page, limit });
  res.json(result);
}

/**
 * @route GET /api/v1/properties/:id
 * @access Public
 */
export async function getPropertyById(req: Request, res: Response) {
  const id = getIdParam(req);
  const property = await PropertyService.getById(id);
  res.json(property);
}

/**
 * @route POST /api/v1/properties
 * @access Private
 * @security Bearer token required. Any authenticated user can create a property; ownerId is set from req.user.id.
 */
export async function createProperty(req: AuthenticatedRequest, res: Response) {
  // Any authenticated user becomes the owner of the created property via ownerId.

  const ownerId = req.user!.id;

  // TODO: add per-owner listing rate limit.

  const property = await PropertyService.create({ ...req.body, ownerId });

  res.status(201).json(property);
}

/**
 * @route PATCH /api/v1/properties/:id
 * @access Private
 * @security Bearer token required. Ownership is verified per-resource.
 */
export async function updateProperty(req: AuthenticatedRequest, res: Response) {
  const id = getIdParam(req);
  const ownerId = req.user!.id;
  const property = await PropertyService.update(id, ownerId, req.body);
  res.json(property);
}

/**
 * @route DELETE /api/v1/properties/:id
 * @access Private
 * @security Bearer token required. Ownership is verified per-resource.
 */
export async function deleteProperty(req: AuthenticatedRequest, res: Response) {
  const id = getIdParam(req);
  const ownerId = req.user!.id;
  await PropertyService.delete(id, ownerId);
  res.status(204).send();
}

/**
 * @route POST /api/v1/properties/:id/activate
 * @access Private
 * @security Bearer token required. Ownership is verified per-resource.
 */
export async function activateProperty(
  req: AuthenticatedRequest,
  res: Response,
) {
  const id = getIdParam(req);
  const ownerId = req.user!.id;
  const property = await PropertyService.setActive(id, ownerId, true);
  res.json(property);
}

/**
 * @route POST /api/v1/properties/:id/deactivate
 * @access Private
 * @security Bearer token required. Ownership is verified per-resource.
 */
export async function deactivateProperty(
  req: AuthenticatedRequest,
  res: Response,
) {
  const id = getIdParam(req);
  const ownerId = req.user!.id;
  const property = await PropertyService.setActive(id, ownerId, false);
  res.json(property);
}
