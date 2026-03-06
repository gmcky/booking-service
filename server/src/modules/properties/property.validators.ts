import { z } from "zod";

export const createPropertySchema = z.object({
  title: z.string().min(5).max(200),
  description: z.string().min(20),
  type: z.enum(["HOTEL_ROOM", "APARTMENT", "HOUSE", "MEETING_ROOM"]),
  city: z.string().min(2),
  address: z.string().min(5),
  pricePerNight: z.number().positive(),
  maxGuests: z.number().int().positive(),
  amenities: z.array(z.string()).default([]),
  images: z.array(z.string().url()).default([]),
});

export const updatePropertySchema = createPropertySchema.partial();

export const propertyQuerySchema = z.object({
  city: z.string().optional(),
  type: z.enum(["HOTEL_ROOM", "APARTMENT", "HOUSE", "MEETING_ROOM"]).optional(),
  minPrice: z.coerce.number().positive().optional(),
  maxPrice: z.coerce.number().positive().optional(),
  maxGuests: z.coerce.number().int().positive().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(10),
});
