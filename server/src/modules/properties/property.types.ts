import type { z } from "zod";
import type {
  createPropertySchema,
  updatePropertySchema,
} from "./property.validators.js";

export type CreatePropertyInput = z.infer<typeof createPropertySchema> & {
  ownerId: string;
};

export type UpdatePropertyInput = z.infer<typeof updatePropertySchema>;

export interface PropertyFilters {
  city?: string;
  type?: string;
  minPrice?: number;
  maxPrice?: number;
  maxGuests?: number;
}
