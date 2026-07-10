import type { Request, Response } from "express";
import type { AuthenticatedRequest } from "../../shared/types/index.js";
import { AppError } from "../../shared/middlewares/error.handler.js";
import { getIdParam } from "../../shared/utils/request.helpers.js";
import { PropertyService } from "./property.service.js";
import type { PropertyQueryInput } from "./property.types.js";

/**
 * @server\src\api.routes.ts
 * @route GET /api/v1/properties
 * @access Public
 */
export async function getProperties(req: Request, res: Response) {
  const {
    page,
    limit,
    city,
    country,
    district,
    ownerId,
    type,
    amenities,
    minPrice,
    maxPrice,
    maxGuests,
    petsAllowed,
    infantsAllowed,
    sort,
    checkIn,
    checkOut,
    minLat,
    maxLat,
    minLng,
    maxLng,
  } = req.query as unknown as PropertyQueryInput;

  const result = await PropertyService.getAll(
    { page, limit },
    {
      city,
      country,
      district,
      ownerId,
      type,
      amenities,
      minPrice,
      maxPrice,
      maxGuests,
      petsAllowed,
      infantsAllowed,
      sort,
      checkIn,
      checkOut,
      minLat,
      maxLat,
      minLng,
      maxLng,
    },
  );

  res.json(result);
}

/**
 * @server\src\api.routes.ts
 * @route GET /api/v1/properties/locations
 * @access Public
 */
export async function getPropertyLocations(req: Request, res: Response) {
  res.json(await PropertyService.getLocations());
}

/**
 * @server\src\api.routes.ts
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
 * @server\src\api.routes.ts
 * @route GET /api/v1/properties/:id
 * @access Public
 */
export async function getPropertyById(req: Request, res: Response) {
  const id = getIdParam(req);
  const property = await PropertyService.getById(
    id,
    req.user
      ? {
          id: req.user.id,
          role: req.user.role,
        }
      : undefined,
  );
  res.json(property);
}

/**
 * @server\src\api.routes.ts
 * @route POST /api/v1/properties/images
 * @access Private
 * @security Bearer token required. Files are written to disk; caller passes returned paths as rawImagePaths on create/update.
 */
export async function uploadPropertyImages(req: AuthenticatedRequest, res: Response) {
  const files = req.files as Express.Multer.File[] | undefined;

  if (!files || files.length === 0) {
    throw new AppError(400, "At least one image file is required");
  }

  const userId = req.user!.id;
  const paths = await PropertyService.saveRawImages(userId, files);

  res.status(201).json({ paths });
}

/**
 * @server\src\api.routes.ts
 * @route POST /api/v1/properties
 * @access Private
 * @security Bearer token required. Any authenticated user can create a property; ownerId is set from req.user.id.
 */
export async function createProperty(req: AuthenticatedRequest, res: Response) {
  const ownerId = req.user!.id;

  const property = await PropertyService.create({ ...req.body, ownerId });

  res.status(201).json(property);
}

/**
 * @server\src\api.routes.ts
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
 * @server\src\api.routes.ts
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
 * @server\src\api.routes.ts
 * @route POST /api/v1/properties/:id/activate
 * @access Private
 * @security Bearer token required. Ownership is verified per-resource.
 */
export async function activateProperty(req: AuthenticatedRequest, res: Response) {
  const id = getIdParam(req);
  const ownerId = req.user!.id;
  const property = await PropertyService.setActive(id, ownerId, true);
  res.json(property);
}

/**
 * @server\src\api.routes.ts
 * @route POST /api/v1/properties/:id/deactivate
 * @access Private
 * @security Bearer token required. Ownership is verified per-resource.
 */
export async function deactivateProperty(req: AuthenticatedRequest, res: Response) {
  const id = getIdParam(req);
  const ownerId = req.user!.id;
  const property = await PropertyService.setActive(id, ownerId, false);
  res.json(property);
}
