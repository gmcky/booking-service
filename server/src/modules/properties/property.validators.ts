import prismaClientPkg from "@prisma/client";
const { Amenity, PropertyType } = prismaClientPkg;
import { z } from "zod";
import { sanitizeString } from "../../shared/utils/sanitize.js";

export const createPropertySchema = z.object({
  title: z.string().min(5).max(200),
  description: z.string().trim().min(20).transform(sanitizeString),
  type: z.nativeEnum(PropertyType),
  city: z.string().min(2),
  address: z.string().min(5),
  pricePerNight: z.number().positive(),
  maxGuests: z.number().int().positive(),
  amenities: z.array(z.nativeEnum(Amenity)).max(20).default([]),
  // Accept temp upload paths; worker resolves final URLs asynchronously.
  rawImagePaths: z.array(z.string()).max(10).default([]),
});

export const updatePropertySchema = z.object({
  title: z.string().min(5).max(200).optional(),
  description: z.string().trim().min(20).transform(sanitizeString).optional(),
  type: z.nativeEnum(PropertyType).optional(),
  city: z.string().min(2).optional(),
  address: z.string().min(5).optional(),
  pricePerNight: z.number().positive().optional(),
  maxGuests: z.number().int().positive().optional(),
  amenities: z.array(z.nativeEnum(Amenity)).max(20).optional(),
  // Expects finalized CDN URLs only.
  images: z.array(z.string().url()).max(10).optional(),
});

export const propertyQuerySchema = z
  .object({
    city: z.string().optional(),
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
    sort: z.enum(["price_asc", "price_desc", "newest"]).default("newest"),
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(10),
    checkIn: z.coerce.date().optional(),
    checkOut: z.coerce.date().optional(),
  })
  .superRefine((val, ctx) => {
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
  });
