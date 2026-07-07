import type { z } from "zod";
import type { favoriteQuerySchema } from "./favorite.validators.js";

export type FavoriteQueryInput = z.infer<typeof favoriteQuerySchema>;
