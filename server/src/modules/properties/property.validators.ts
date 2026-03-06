import { Amenity, PropertyType } from "@prisma/client";
import { z } from "zod";

export const createPropertySchema = z.object({
  title: z.string().min(5).max(200),
  description: z.string().min(20),
  type: z.nativeEnum(PropertyType),
  city: z.string().min(2),
  address: z.string().min(5),
  pricePerNight: z.number().positive(),
  maxGuests: z.number().int().positive(),
  amenities: z.array(z.nativeEnum(Amenity)).max(20).default([]),
  // Temporary file paths / presigned keys. The image processing worker
  // resizes, compresses, uploads to S3, and writes final CDN URLs to the DB.
  rawImagePaths: z.array(z.string()).max(10).default([]),
});

export const updatePropertySchema = z.object({
  title: z.string().min(5).max(200).optional(),
  description: z.string().min(20).optional(),
  type: z.nativeEnum(PropertyType).optional(),
  city: z.string().min(2).optional(),
  address: z.string().min(5).optional(),
  pricePerNight: z.number().positive().optional(),
  maxGuests: z.number().int().positive().optional(),
  amenities: z.array(z.nativeEnum(Amenity)).max(20).optional(),
  // Final CDN URLs — set directly when reordering or replacing already-processed images.
  images: z.array(z.string().url()).max(10).optional(),
});

export const propertyQuerySchema = z.object({
  city: z.string().optional(),
  type: z.nativeEnum(PropertyType).optional(),
  // Handles both ?amenities=WIFI,PARKING and ?amenities=WIFI&amenities=PARKING
  amenities: z
    .preprocess(
      (val) => (typeof val === "string" ? val.split(",") : val),
      z.array(z.nativeEnum(Amenity)).optional(),
    )
    .optional(),
  minPrice: z.coerce.number().positive().optional(),
  maxPrice: z.coerce.number().positive().optional(),
  maxGuests: z.coerce.number().int().positive().optional(),
  // // TODO: Refactor to dynamic multi-column sorting
  sort: z.enum(["price_asc", "price_desc", "newest"]).default("newest"),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(10),
});
