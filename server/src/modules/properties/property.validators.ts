import prismaClientPkg from "@prisma/client";
const { Amenity, PropertyType } = prismaClientPkg;
import { z } from "zod";
import { sanitizeString } from "../../shared/utils/sanitize.js";

// Both-or-neither: a lone latitude/longitude can't place a pin on the map.
function refineCoordPair(val: { latitude?: number; longitude?: number }, ctx: z.RefinementCtx) {
  const hasLat = val.latitude !== undefined;
  const hasLng = val.longitude !== undefined;
  if (hasLat !== hasLng) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "latitude and longitude must both be provided or both omitted",
      path: hasLat ? ["longitude"] : ["latitude"],
    });
  }
}

export const createPropertySchema = z
  .object({
    title: z.string().min(5).max(200),
    description: z.string().trim().min(20).transform(sanitizeString),
    type: z.nativeEnum(PropertyType),
    city: z.string().min(2),
    country: z.string().min(2),
    district: z.string().min(2).max(100).optional(),
    address: z.string().min(5),
    latitude: z.number().min(-90).max(90).optional(),
    longitude: z.number().min(-180).max(180).optional(),
    pricePerNight: z.number().positive(),
    maxGuests: z.number().int().positive(),
    petsAllowed: z.boolean().default(false),
    infantsAllowed: z.boolean().default(true),
    amenities: z.array(z.nativeEnum(Amenity)).max(20).default([]),
    // Accept temp upload paths; worker resolves final URLs asynchronously.
    rawImagePaths: z.array(z.string()).max(10).default([]),
  })
  .superRefine(refineCoordPair);

export const updatePropertySchema = z
  .object({
    title: z.string().min(5).max(200).optional(),
    description: z.string().trim().min(20).transform(sanitizeString).optional(),
    type: z.nativeEnum(PropertyType).optional(),
    city: z.string().min(2).optional(),
    country: z.string().min(2).optional(),
    district: z.string().min(2).max(100).optional(),
    address: z.string().min(5).optional(),
    latitude: z.number().min(-90).max(90).optional(),
    longitude: z.number().min(-180).max(180).optional(),
    pricePerNight: z.number().positive().optional(),
    maxGuests: z.number().int().positive().optional(),
    petsAllowed: z.boolean().optional(),
    infantsAllowed: z.boolean().optional(),
    amenities: z.array(z.nativeEnum(Amenity)).max(20).optional(),
    // Expects finalized CDN URLs only.
    images: z.array(z.string().url()).max(10).optional(),
  })
  .superRefine(refineCoordPair);

// Search filters shared by the paginated list endpoint and the map-markers
// endpoint (which needs the same filtering but no sort/pagination).
const searchFilterShape = {
  city: z.string().optional(),
  country: z.string().optional(),
  district: z.string().optional(),
  ownerId: z.string().uuid().optional(),
  type: z.nativeEnum(PropertyType).optional(),
  // Accepts CSV and repeated query params for amenities.
  amenities: z
    .preprocess(
      (val) => (typeof val === "string" ? val.split(",") : val),
      z.array(z.nativeEnum(Amenity)).optional(),
    )
    .optional(),
  minPrice: z.coerce.number().positive().optional(),
  maxPrice: z.coerce.number().positive().optional(),
  maxGuests: z.coerce.number().int().positive().optional(),
  // Filters are one-directional: true narrows to allowing listings,
  // absent/false imposes no constraint.
  petsAllowed: z
    .preprocess((v) => (typeof v === "string" ? v === "true" : v), z.boolean().optional())
    .optional(),
  infantsAllowed: z
    .preprocess((v) => (typeof v === "string" ? v === "true" : v), z.boolean().optional())
    .optional(),
  checkIn: z.coerce.date().optional(),
  checkOut: z.coerce.date().optional(),
  minLat: z.coerce.number().min(-90).max(90).optional(),
  maxLat: z.coerce.number().min(-90).max(90).optional(),
  minLng: z.coerce.number().min(-180).max(180).optional(),
  maxLng: z.coerce.number().min(-180).max(180).optional(),
};

function refineSearchFilters(
  val: {
    checkIn?: Date;
    checkOut?: Date;
    minLat?: number;
    maxLat?: number;
    minLng?: number;
    maxLng?: number;
  },
  ctx: z.RefinementCtx,
) {
  const hasIn = val.checkIn !== undefined;
  const hasOut = val.checkOut !== undefined;
  if (hasIn !== hasOut) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "checkIn and checkOut must both be provided or both omitted",
      path: hasIn ? ["checkOut"] : ["checkIn"],
    });
  }
  if (hasIn && hasOut && val.checkIn! >= val.checkOut!) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "checkIn must be before checkOut",
      path: ["checkIn"],
    });
  }

  // Bounding box is all-or-nothing: a partial box can't bound a search.
  const bboxFields = [
    ["minLat", val.minLat] as const,
    ["maxLat", val.maxLat] as const,
    ["minLng", val.minLng] as const,
    ["maxLng", val.maxLng] as const,
  ];
  const presentCount = bboxFields.filter(([, v]) => v !== undefined).length;
  if (presentCount > 0 && presentCount < bboxFields.length) {
    for (const [field, v] of bboxFields) {
      if (v === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "minLat, maxLat, minLng, maxLng must all be provided or all omitted",
          path: [field],
        });
      }
    }
  }
  if (presentCount === bboxFields.length) {
    if (val.minLat! > val.maxLat!) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "minLat must not exceed maxLat",
        path: ["minLat"],
      });
    }
    if (val.minLng! > val.maxLng!) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "minLng must not exceed maxLng",
        path: ["minLng"],
      });
    }
  }
}

export const propertyQuerySchema = z
  .object({
    ...searchFilterShape,
    sort: z.enum(["price_asc", "price_desc", "newest"]).default("newest"),
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(10),
  })
  .superRefine(refineSearchFilters);

export const mapMarkersQuerySchema = z.object(searchFilterShape).superRefine(refineSearchFilters);
