import { Router, type IRouter } from "express";
import { authenticate, optionalAuth } from "../../shared/middlewares/auth.js";
import { validate } from "../../shared/middlewares/validate.js";
import { asyncHandler } from "../../shared/utils/async.handler.js";
import * as propertyController from "./property.controller.js";
import {
  createPropertySchema,
  updatePropertySchema,
  propertyQuerySchema,
} from "./property.validators.js";

export const propertyRouter: IRouter = Router();

/**
 * @openapi
 * /properties:
 *   get:
 *     tags: [Properties]
 *     summary: Search properties with filters
 *     parameters:
 *       - { in: query, name: city, schema: { type: string } }
 *       - { in: query, name: type, schema: { type: string } }
 *       - { in: query, name: amenities, schema: { type: string }, description: 'CSV of amenity enums' }
 *       - { in: query, name: minPrice, schema: { type: number } }
 *       - { in: query, name: maxPrice, schema: { type: number } }
 *       - { in: query, name: maxGuests, schema: { type: integer } }
 *       - { in: query, name: sort, schema: { type: string, enum: [price_asc, price_desc, newest], default: newest } }
 *       - { in: query, name: page, schema: { type: integer, default: 1 } }
 *       - { in: query, name: limit, schema: { type: integer, default: 10, maximum: 100 } }
 *       - { in: query, name: checkIn, schema: { type: string, format: date-time } }
 *       - { in: query, name: checkOut, schema: { type: string, format: date-time } }
 *     responses:
 *       200: { description: Paginated property list }
 *       400: { $ref: '#/components/responses/ValidationError' }
 */
propertyRouter.get(
  "/",
  validate(propertyQuerySchema, "query"),
  asyncHandler(propertyController.getProperties),
);

/**
 * @openapi
 * /properties/my:
 *   get:
 *     tags: [Properties]
 *     summary: List properties owned by current user
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: List of owned properties }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
propertyRouter.get(
  "/my",
  authenticate,
  asyncHandler(propertyController.getMyProperties),
);

/**
 * @openapi
 * /properties/{id}:
 *   get:
 *     tags: [Properties]
 *     summary: Get property by id (auth optional, reveals owner extras)
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200: { description: Property detail }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
propertyRouter.get(
  "/:id",
  optionalAuth,
  asyncHandler(propertyController.getPropertyById),
);

propertyRouter.use(authenticate);

/**
 * @openapi
 * /properties:
 *   post:
 *     tags: [Properties]
 *     summary: Create new property listing
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [title, description, type, city, address, pricePerNight, maxGuests]
 *             properties:
 *               title: { type: string, minLength: 5, maxLength: 200 }
 *               description: { type: string, minLength: 20 }
 *               type: { type: string }
 *               city: { type: string }
 *               address: { type: string }
 *               pricePerNight: { type: number }
 *               maxGuests: { type: integer }
 *               amenities: { type: array, items: { type: string }, maxItems: 20 }
 *               rawImagePaths: { type: array, items: { type: string }, maxItems: 10 }
 *     responses:
 *       201: { description: Property created }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
propertyRouter.post(
  "/",
  validate(createPropertySchema),
  asyncHandler(propertyController.createProperty),
);

/**
 * @openapi
 * /properties/{id}:
 *   patch:
 *     tags: [Properties]
 *     summary: Update property (owner only)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title: { type: string }
 *               description: { type: string }
 *               type: { type: string }
 *               city: { type: string }
 *               address: { type: string }
 *               pricePerNight: { type: number }
 *               maxGuests: { type: integer }
 *               amenities: { type: array, items: { type: string } }
 *               images: { type: array, items: { type: string, format: uri } }
 *     responses:
 *       200: { description: Property updated }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
propertyRouter.patch(
  "/:id",
  validate(updatePropertySchema),
  asyncHandler(propertyController.updateProperty),
);

/**
 * @openapi
 * /properties/{id}:
 *   delete:
 *     tags: [Properties]
 *     summary: Soft-delete property (owner only)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       204: { description: Property deleted }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
propertyRouter.delete("/:id", asyncHandler(propertyController.deleteProperty));

/**
 * @openapi
 * /properties/{id}/activate:
 *   post:
 *     tags: [Properties]
 *     summary: Activate property listing (owner only)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200: { description: Property activated }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
propertyRouter.post(
  "/:id/activate",
  asyncHandler(propertyController.activateProperty),
);

/**
 * @openapi
 * /properties/{id}/deactivate:
 *   post:
 *     tags: [Properties]
 *     summary: Deactivate property listing (owner only)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200: { description: Property deactivated }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
propertyRouter.post(
  "/:id/deactivate",
  asyncHandler(propertyController.deactivateProperty),
);
