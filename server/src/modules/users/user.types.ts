import type { z } from "zod";
import type {
  updateUserSchema,
  deleteCurrentUserSchema,
  changePasswordSchema,
  getUsersQuerySchema,
  getHostReviewsQuerySchema,
  requestEmailChangeSchema,
  confirmEmailChangeSchema,
} from "./user.validators.js";

export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type DeleteCurrentUserInput = z.infer<typeof deleteCurrentUserSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type GetUsersQueryInput = z.infer<typeof getUsersQuerySchema>;
export type GetHostReviewsQueryInput = z.infer<typeof getHostReviewsQuerySchema>;
export type RequestEmailChangeInput = z.infer<typeof requestEmailChangeSchema>;
export type ConfirmEmailChangeInput = z.infer<typeof confirmEmailChangeSchema>;
