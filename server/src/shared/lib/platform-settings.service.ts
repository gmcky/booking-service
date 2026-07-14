import { prisma } from "./prisma.js";

/**
 * App-wide configuration stored as a single row. The host-cancellation
 * auto-approval policy lives here so admins can tune it at runtime instead of
 * relying on a hardcoded constant.
 */
const SINGLETON_ID = "singleton";

export interface PlatformSettingsUpdate {
  hostCancelAutoApproveEnabled?: boolean;
  hostCancelAutoApproveDays?: number;
}

export class PlatformSettingsService {
  /** Read the settings row, creating it with schema defaults on first access. */
  static async get() {
    return prisma.platformSetting.upsert({
      where: { id: SINGLETON_ID },
      create: { id: SINGLETON_ID },
      update: {},
    });
  }

  /** Update settings, recording which admin made the change. */
  static async update(data: PlatformSettingsUpdate, adminId: string) {
    return prisma.platformSetting.upsert({
      where: { id: SINGLETON_ID },
      create: { id: SINGLETON_ID, ...data, updatedById: adminId },
      update: { ...data, updatedById: adminId },
    });
  }
}
