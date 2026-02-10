import type { z } from "zod";
import type { updateUserSchema } from "./user.validators.js";

export type UpdateUserInput = z.infer<typeof updateUserSchema>;
