import { z } from "zod";

export const updateUserSchema = z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  // TODO: block direct email mutation until verified email-change flow exists.
  email: z.string().email().optional(),
});
