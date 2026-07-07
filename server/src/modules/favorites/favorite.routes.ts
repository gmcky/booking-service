import { Router, type IRouter } from "express";
import { authenticate } from "../../shared/middlewares/auth.js";
import { validate } from "../../shared/middlewares/validate.js";
import { asyncHandler } from "../../shared/utils/async.handler.js";
import * as favoriteController from "./favorite.controller.js";
import { favoriteQuerySchema } from "./favorite.validators.js";

export const favoriteRouter: IRouter = Router();

favoriteRouter.use(authenticate);

/**
 * @openapi
 * /favorites/ids:
 *   get:
 *     tags: [Favorites]
 *     summary: All favorited propertyIds for the current user (heart-state hydration)
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Unpaginated list of favorited property ids
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ids:
 *                   type: array
 *                   items: { type: string, format: uuid }
 *               required: [ids]
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
favoriteRouter.get("/ids", asyncHandler(favoriteController.getFavoriteIds));

/**
 * @openapi
 * /favorites:
 *   get:
 *     tags: [Favorites]
 *     summary: List current user's favorited properties
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: query, name: page, schema: { type: integer, default: 1 } }
 *       - { in: query, name: limit, schema: { type: integer, default: 10, maximum: 50 } }
 *     responses:
 *       200:
 *         description: Paginated favorite list, newest first
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items: { $ref: '#/components/schemas/Favorite' }
 *                 pagination:
 *                   $ref: '#/components/schemas/Pagination'
 *               required: [data, pagination]
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
favoriteRouter.get(
  "/",
  validate(favoriteQuerySchema, "query"),
  asyncHandler(favoriteController.getFavorites),
);

/**
 * @openapi
 * /favorites/{propertyId}:
 *   post:
 *     tags: [Favorites]
 *     summary: Favorite a property (idempotent)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: propertyId, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       201:
 *         description: Favorite created (or already existed)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Favorite'
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
favoriteRouter.post("/:propertyId", asyncHandler(favoriteController.addFavorite));

/**
 * @openapi
 * /favorites/{propertyId}:
 *   delete:
 *     tags: [Favorites]
 *     summary: Unfavorite a property (idempotent, no error if not favorited)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: propertyId, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       204: { description: Favorite removed (or never existed) }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
favoriteRouter.delete("/:propertyId", asyncHandler(favoriteController.removeFavorite));
