import { z } from "zod";
import prismaClientPkg from "@prisma/client";
const { HostCancellationStatus } = prismaClientPkg;

export const hostCancellationsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  status: z.nativeEnum(HostCancellationStatus).optional(),
});

export const rejectHostCancellationSchema = z.object({
  reason: z.string().trim().max(1000).optional(),
});

export const updateSettingsSchema = z
  .object({
    hostCancelAutoApproveEnabled: z.boolean().optional(),
    hostCancelAutoApproveDays: z.number().int().min(1).max(90).optional(),
  })
  .refine(
    (d) =>
      d.hostCancelAutoApproveEnabled !== undefined || d.hostCancelAutoApproveDays !== undefined,
    { message: "At least one setting must be provided" },
  );

export type HostCancellationsQueryInput = z.infer<typeof hostCancellationsQuerySchema>;
