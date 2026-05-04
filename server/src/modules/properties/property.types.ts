import type { z } from "zod";
import type { Amenity, PropertyType } from "@prisma/client";
import type {
  createPropertySchema,
  updatePropertySchema,
  propertyQuerySchema,
} from "./property.validators.js";

export type CreatePropertyInput = z.infer<typeof createPropertySchema> & {
  ownerId: string;
};

export type UpdatePropertyInput = z.infer<typeof updatePropertySchema>;

export type PropertyQueryInput = z.infer<typeof propertyQuerySchema>;

export interface PropertyFilters {
  city?: string;
  type?: PropertyType;
  amenities?: Amenity[];
  minPrice?: number;
  maxPrice?: number;
  maxGuests?: number;
  sort?: "price_asc" | "price_desc" | "newest";
  checkIn?: Date;
  checkOut?: Date;
}
