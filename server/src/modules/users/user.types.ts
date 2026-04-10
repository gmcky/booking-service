import type { z } from "zod";
import type {
  updateUserSchema,
  requestEmailChangeSchema,
  confirmEmailChangeSchema,
} from "./user.validators.js";

export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type RequestEmailChangeInput = z.infer<typeof requestEmailChangeSchema>;
export type ConfirmEmailChangeInput = z.infer<typeof confirmEmailChangeSchema>;
