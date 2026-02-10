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
  minPrice: z.string().transform(Number).optional(),
  maxPrice: z.string().transform(Number).optional(),
  maxGuests: z.string().transform(Number).optional(),
  page: z.string().transform(Number).optional(),
  limit: z.string().transform(Number).optional(),
});
