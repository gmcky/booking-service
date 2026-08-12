import type { Response } from "express";
import type { AuthenticatedRequest } from "../../shared/types/index.js";
import { getIdParam } from "../../shared/utils/request.helpers.js";
import { FavoriteService } from "./favorite.service.js";
import type { FavoriteQueryInput } from "./favorite.types.js";

/**
 * @route POST /api/v1/favorites/:propertyId
 * @access Private
 * @security Bearer token required.
 */
export async function addFavorite(req: AuthenticatedRequest, res: Response) {
  const userId = req.user!.id;
  const propertyId = getIdParam(req, "propertyId");

  const favorite = await FavoriteService.add(userId, propertyId);
  res.status(201).json(favorite);
}

/**
 * @route DELETE /api/v1/favorites/:propertyId
 * @access Private
 * @security Bearer token required.
 */
export async function removeFavorite(req: AuthenticatedRequest, res: Response) {
  const userId = req.user!.id;
  const propertyId = getIdParam(req, "propertyId");

  await FavoriteService.remove(userId, propertyId);
  res.status(204).send();
}

/**
 * @route GET /api/v1/favorites
 * @access Private
 * @security Bearer token required.
 */
export async function getFavorites(req: AuthenticatedRequest, res: Response) {
  const userId = req.user!.id;
  const { page, limit } = req.query as unknown as FavoriteQueryInput;

  const result = await FavoriteService.list(userId, { page, limit });
  res.json(result);
}

/**
 * @route GET /api/v1/favorites/ids
 * @access Private
 * @security Bearer token required.
 */
export async function getFavoriteIds(req: AuthenticatedRequest, res: Response) {
  const userId = req.user!.id;

  const result = await FavoriteService.listIds(userId);
  res.json(result);
}
