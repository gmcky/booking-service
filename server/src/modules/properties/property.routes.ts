import { Router, type IRouter } from "express";
import multer from "multer";
import { authenticate, optionalAuth, requireVerifiedEmail } from "../../shared/middlewares/auth.js";
import { AppError } from "../../shared/middlewares/error.handler.js";
import { validate } from "../../shared/middlewares/validate.js";
import { asyncHandler } from "../../shared/utils/async.handler.js";
import * as propertyController from "./property.controller.js";
import {
  createPropertySchema,
  updatePropertySchema,
  propertyQuerySchema,
  mapMarkersQuerySchema,
  addressSuggestQuerySchema,
} from "./property.validators.js";

export const propertyRouter: IRouter = Router();

// Whitelist raster formats only, mirroring the avatar upload guard.
const ALLOWED_PROPERTY_IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

const propertyImageUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 10,
  },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_PROPERTY_IMAGE_MIME_TYPES.has(file.mimetype)) {
      cb(new AppError(400, "Only JPEG, PNG, or WebP images are allowed"));
      return;
    }

    cb(null, true);
  },
});

/**
 * @openapi
 * /properties:
 *   get:
 *     tags: [Properties]
 *     summary: Search properties with filters
 *     parameters:
 *       - { in: query, name: city, schema: { type: string } }
 *       - { in: query, name: country, schema: { type: string } }
 *       - { in: query, name: district, schema: { type: string } }
 *       - { in: query, name: ownerId, schema: { type: string, format: uuid }, description: 'Filter to listings owned by this host' }
 *       - { in: query, name: type, schema: { type: string, enum: [HOTEL_ROOM, APARTMENT, HOUSE, MEETING_ROOM] } }
 *       - { in: query, name: amenities, schema: { type: string }, description: 'CSV of Amenity enum values' }
 *       - { in: query, name: minPrice, schema: { type: number } }
 *       - { in: query, name: maxPrice, schema: { type: number } }
 *       - { in: query, name: maxGuests, schema: { type: integer } }
 *       - { in: query, name: petsAllowed, schema: { type: boolean }, description: 'true narrows to pet-friendly listings' }
 *       - { in: query, name: infantsAllowed, schema: { type: boolean }, description: 'true narrows to infant-suitable listings' }
 *       - { in: query, name: sort, schema: { type: string, enum: [price_asc, price_desc, newest], default: newest } }
 *       - { in: query, name: page, schema: { type: integer, default: 1 } }
 *       - { in: query, name: limit, schema: { type: integer, default: 10, maximum: 100 } }
 *       - { in: query, name: checkIn, schema: { type: string, format: date-time } }
 *       - { in: query, name: checkOut, schema: { type: string, format: date-time } }
 *       - { in: query, name: minLat, schema: { type: number, minimum: -90, maximum: 90 }, description: 'Bounding-box filter — provide all four of minLat/maxLat/minLng/maxLng together' }
 *       - { in: query, name: maxLat, schema: { type: number, minimum: -90, maximum: 90 } }
 *       - { in: query, name: minLng, schema: { type: number, minimum: -180, maximum: 180 } }
 *       - { in: query, name: maxLng, schema: { type: number, minimum: -180, maximum: 180 } }
 *     responses:
 *       200:
 *         description: Paginated property list
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items: { $ref: '#/components/schemas/PropertyWithOwner' }
 *                 pagination:
 *                   $ref: '#/components/schemas/Pagination'
 *               required: [data, pagination]
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
 *       200:
 *         description: List of owned properties
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items: { $ref: '#/components/schemas/Property' }
 *                 pagination:
 *                   $ref: '#/components/schemas/Pagination'
 *               required: [data, pagination]
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
propertyRouter.get("/my", authenticate, asyncHandler(propertyController.getMyProperties));

/**
 * @openapi
 * /properties/map-markers:
 *   get:
 *     tags: [Properties]
 *     summary: All matching map markers (no pagination) for the browse map
 *     parameters:
 *       - { in: query, name: city, schema: { type: string } }
 *       - { in: query, name: country, schema: { type: string } }
 *       - { in: query, name: district, schema: { type: string } }
 *       - { in: query, name: ownerId, schema: { type: string, format: uuid } }
 *       - { in: query, name: type, schema: { type: string, enum: [HOTEL_ROOM, APARTMENT, HOUSE, MEETING_ROOM] } }
 *       - { in: query, name: amenities, schema: { type: string }, description: 'CSV of Amenity enum values' }
 *       - { in: query, name: minPrice, schema: { type: number } }
 *       - { in: query, name: maxPrice, schema: { type: number } }
 *       - { in: query, name: maxGuests, schema: { type: integer } }
 *       - { in: query, name: petsAllowed, schema: { type: boolean } }
 *       - { in: query, name: infantsAllowed, schema: { type: boolean } }
 *       - { in: query, name: checkIn, schema: { type: string, format: date-time } }
 *       - { in: query, name: checkOut, schema: { type: string, format: date-time } }
 *       - { in: query, name: minLat, schema: { type: number, minimum: -90, maximum: 90 }, description: 'Bounding-box filter — provide all four of minLat/maxLat/minLng/maxLng together' }
 *       - { in: query, name: maxLat, schema: { type: number, minimum: -90, maximum: 90 } }
 *       - { in: query, name: minLng, schema: { type: number, minimum: -180, maximum: 180 } }
 *       - { in: query, name: maxLng, schema: { type: number, minimum: -180, maximum: 180 } }
 *     responses:
 *       200:
 *         description: Markers for every active listing matching the filters, capped at 500
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items: { $ref: '#/components/schemas/PropertyMapMarker' }
 *       400: { $ref: '#/components/responses/ValidationError' }
 */
propertyRouter.get(
  "/map-markers",
  validate(mapMarkersQuerySchema, "query"),
  asyncHandler(propertyController.getPropertyMapMarkers),
);

/**
 * @openapi
 * /properties/locations:
 *   get:
 *     tags: [Properties]
 *     summary: Location facets (country/city/district counts) for active listings
 *     responses:
 *       200:
 *         description: Location tree, sorted alphabetically at every level
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items: { $ref: '#/components/schemas/LocationCountry' }
 */
propertyRouter.get("/locations", asyncHandler(propertyController.getPropertyLocations));

/**
 * @openapi
 * /properties/address-suggest:
 *   get:
 *     tags: [Properties]
 *     summary: Address autocomplete for the host form (English-normalized)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: query, name: q, required: true, schema: { type: string, minLength: 2, maxLength: 200 } }
 *       - { in: query, name: limit, schema: { type: integer, minimum: 1, maximum: 10, default: 5 } }
 *       - { in: query, name: kind, schema: { type: string, enum: [street, city], default: street } }
 *       - { in: query, name: country, schema: { type: string, minLength: 2, maxLength: 100 }, description: 'Prefer results from this country' }
 *       - { in: query, name: city, schema: { type: string, minLength: 2, maxLength: 100 }, description: 'Prefer results from this city (street kind only)' }
 *     responses:
 *       200:
 *         description: Street- and house-level suggestions with coordinates
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items: { $ref: '#/components/schemas/AddressSuggestion' }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
// Registered before "/:id" so the literal path wins; authenticated inline
// because the shared authenticate gate only covers routes below "/:id".
propertyRouter.get(
  "/address-suggest",
  authenticate,
  validate(addressSuggestQuerySchema, "query"),
  asyncHandler(propertyController.getAddressSuggestions),
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
 *       200:
 *         description: Property detail
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/PropertyDetail'
 *       404: { $ref: '#/components/responses/NotFound' }
 */
propertyRouter.get("/:id", optionalAuth, asyncHandler(propertyController.getPropertyById));

propertyRouter.use(authenticate);

/**
 * @openapi
 * /properties/images:
 *   post:
 *     tags: [Properties]
 *     summary: Upload raw property image files (owner only, pre-create)
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [images]
 *             properties:
 *               images:
 *                 type: array
 *                 items: { type: string, format: binary }
 *     responses:
 *       201:
 *         description: Raw image paths saved, ready for rawImagePaths on create/update
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 paths:
 *                   type: array
 *                   items: { type: string }
 *               required: [paths]
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
propertyRouter.post(
  "/images",
  propertyImageUpload.array("images", 10),
  asyncHandler(propertyController.uploadPropertyImages),
);

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
 *             required: [title, description, type, city, country, street, pricePerNight, maxGuests]
 *             properties:
 *               title: { type: string, minLength: 5, maxLength: 200 }
 *               description: { type: string, minLength: 20 }
 *               type: { type: string, enum: [HOTEL_ROOM, APARTMENT, HOUSE, MEETING_ROOM] }
 *               city: { type: string }
 *               country: { type: string, minLength: 2 }
 *               district: { type: string, minLength: 2, maxLength: 100 }
 *               street: { type: string, minLength: 2, maxLength: 200 }
 *               houseNumber: { type: string, maxLength: 20 }
 *               apartment: { type: string, maxLength: 20 }
 *               latitude: { type: number, minimum: -90, maximum: 90 }
 *               longitude: { type: number, minimum: -180, maximum: 180 }
 *               pricePerNight: { type: number }
 *               maxGuests: { type: integer }
 *               checkInTime: { type: string, pattern: '^([01]\d|2[0-3]):[0-5]\d$', example: '15:00' }
 *               checkOutTime: { type: string, pattern: '^([01]\d|2[0-3]):[0-5]\d$', example: '11:00' }
 *               amenities: { type: array, items: { $ref: '#/components/schemas/Amenity' }, maxItems: 20 }
 *               rawImagePaths: { type: array, items: { type: string }, maxItems: 10 }
 *     responses:
 *       201:
 *         description: Property created
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/PropertyWithOwner'
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { description: 'Email not verified (code: EMAIL_NOT_VERIFIED)' }
 */
propertyRouter.post(
  "/",
  requireVerifiedEmail,
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
 *               type: { type: string, enum: [HOTEL_ROOM, APARTMENT, HOUSE, MEETING_ROOM] }
 *               city: { type: string }
 *               country: { type: string, minLength: 2 }
 *               district: { type: string, minLength: 2, maxLength: 100, nullable: true }
 *               street: { type: string, minLength: 2, maxLength: 200 }
 *               houseNumber: { type: string, maxLength: 20, nullable: true }
 *               apartment: { type: string, maxLength: 20, nullable: true }
 *               latitude: { type: number, minimum: -90, maximum: 90 }
 *               longitude: { type: number, minimum: -180, maximum: 180 }
 *               pricePerNight: { type: number }
 *               maxGuests: { type: integer }
 *               checkInTime: { type: string, pattern: '^([01]\d|2[0-3]):[0-5]\d$', example: '15:00', nullable: true }
 *               checkOutTime: { type: string, pattern: '^([01]\d|2[0-3]):[0-5]\d$', example: '11:00', nullable: true }
 *               amenities: { type: array, items: { $ref: '#/components/schemas/Amenity' } }
 *               images: { type: array, items: { type: string, format: uri } }
 *     responses:
 *       200:
 *         description: Property updated
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Property'
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
 *       200:
 *         description: Property activated
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Property'
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
propertyRouter.post("/:id/activate", asyncHandler(propertyController.activateProperty));

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
 *       200:
 *         description: Property deactivated
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Property'
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
propertyRouter.post("/:id/deactivate", asyncHandler(propertyController.deactivateProperty));
