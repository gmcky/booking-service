import { prisma } from "../../shared/lib/prisma.js";
import type { Prisma } from "@prisma/client";
import { AppError } from "../../shared/middlewares/error.handler.js";
import { logger } from "../../shared/lib/logger.js";
import type { PaginationParams } from "../../shared/types/index.js";
import {
  calculatePagination,
  createPaginatedResponse,
} from "../../shared/utils/pagination.js";
import { omitUndefined } from "../../shared/utils/prisma.helpers.js";
import type { GetUsersQueryInput, UpdateUserInput } from "./user.types.js";
import { cacheClient, cacheGet, cacheSet } from "../../shared/lib/cache.js";
import { emailQueue } from "../../shared/queues/email.queue.js";
import { randomInt, randomUUID } from "crypto";
import bcrypt from "bcrypt";
import sharp from "sharp";
import { deleteFromS3, uploadToS3 } from "../../shared/lib/storage.js";
import { calculateNights } from "../../shared/utils/date.helpers.js";
import {
  getUserStatsCacheKey,
  invalidateUserStatsCache,
  USER_STATS_CACHE_TTL_SECONDS,
} from "./user.stats.cache.js";

const AVATAR_MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024;
type UserViewMode = "self" | "public";
type AdminListParams = PaginationParams & {
  role?: GetUsersQueryInput["role"];
  dateFrom?: Date;
  dateTo?: Date;
  search?: string;
  isDeleted?: boolean;
};

/** User profile, account lifecycle, and admin moderation operations. */
export class UserService {
  static async getById(
    id: string,
    options: { mode?: UserViewMode } = {},
  ) {
    const mode = options.mode ?? "self";

    if (mode === "public") {
      const user = await prisma.user.findFirst({
        where: { id, isDeleted: false, isSuspended: false },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          avatarUrl: true,
          createdAt: true,
        },
      });

      if (!user) {
        throw new AppError(404, "User not found");
      }

      const [ratingAggregate, listingCount] = await Promise.all([
        prisma.review.aggregate({
          where: {
            property: {
              ownerId: id,
              isActive: true,
            },
          },
          _avg: { rating: true },
        }),
        prisma.property.count({
          where: {
            ownerId: id,
            isActive: true,
          },
        }),
      ]);

      return {
        ...user,
        averageRating:
          ratingAggregate._avg.rating !== null
            ? Number(ratingAggregate._avg.rating)
            : null,
        listingsCount: listingCount,
      };
    }

    const user = await prisma.user.findFirst({
      where: { id, isDeleted: false },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        avatarUrl: true,
        isSuspended: true,
        role: true,
        createdAt: true,
      },
    });

    if (!user) {
      throw new AppError(404, "User not found");
    }

    return user;
  }

  static async getAll(params: AdminListParams) {
    const { skip, take } = calculatePagination(params.page, params.limit);
    const where: Prisma.UserWhereInput = {
      isDeleted: params.isDeleted ?? false,
    };

    if (params.role) {
      where.role = params.role;
    }

    if (params.dateFrom || params.dateTo) {
      where.createdAt = {
        ...(params.dateFrom ? { gte: params.dateFrom } : {}),
        ...(params.dateTo ? { lte: params.dateTo } : {}),
      };
    }

    if (params.search) {
      where.OR = [
        { email: { contains: params.search, mode: "insensitive" } },
        { firstName: { contains: params.search, mode: "insensitive" } },
        { lastName: { contains: params.search, mode: "insensitive" } },
      ];
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          avatarUrl: true,
          isDeleted: true,
          isSuspended: true,
          role: true,
          createdAt: true,
        },
      }),
      prisma.user.count({ where }),
    ]);

    return createPaginatedResponse(users, total, params);
  }

  static async update(id: string, data: UpdateUserInput) {
    const existingUser = await prisma.user.findFirst({
      where: { id, isDeleted: false },
      select: { id: true },
    });

    if (!existingUser) {
      throw new AppError(404, "User not found");
    }

    const {
      firstName,
      lastName,
      phoneNumber,
      dateOfBirth,
      bio,
    } = data;

    const updateData = omitUndefined({
      firstName,
      lastName,
      phoneNumber,
      dateOfBirth,
      bio,
    });

    // Whitelist patchable fields; email/role/password mutate via dedicated flows.
    const user = await prisma.user.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        avatarUrl: true,
        phoneNumber: true,
        dateOfBirth: true,
        bio: true,
        role: true,
      },
    });

    logger.info(
      { userId: id, changedFields: Object.keys(updateData) },
      "User profile updated",
    );

    return user;
  }

  static async uploadAvatar(userId: string, file: Express.Multer.File) {
    if (!file) {
      throw new AppError(400, "Avatar file is required");
    }

    if (!file.mimetype.startsWith("image/")) {
      throw new AppError(400, "Unsupported image format");
    }

    if (file.size > AVATAR_MAX_FILE_SIZE_BYTES) {
      throw new AppError(400, "Avatar size must be 2MB or less");
    }

    const user = await prisma.user.findFirst({
      where: { id: userId, isDeleted: false },
      select: { id: true, avatarUrl: true },
    });

    if (!user) {
      throw new AppError(404, "User not found");
    }

    let optimizedAvatar: Buffer;
    try {
      optimizedAvatar = await sharp(file.buffer)
        .rotate()
        .resize(512, 512, {
          fit: "cover",
          position: "centre",
        })
        .webp({ quality: 82 })
        .toBuffer();
    } catch {
      throw new AppError(400, "Invalid image file");
    }

    const key = `avatars/${userId}/${randomUUID()}.webp`;
    const avatarUrl = await uploadToS3(optimizedAvatar, key, "image/webp");

    await prisma.user.update({
      where: { id: userId },
      data: { avatarUrl },
    });

    if (user.avatarUrl) {
      try {
        await deleteFromS3(user.avatarUrl);
      } catch (error) {
        logger.warn(
          { userId, oldAvatarUrl: user.avatarUrl, error },
          "Failed to delete previous avatar from S3",
        );
      }
    }

    logger.info({ userId, avatarUrl }, "User avatar uploaded");

    return avatarUrl;
  }

  static async deleteAvatar(userId: string) {
    const user = await prisma.user.findFirst({
      where: { id: userId, isDeleted: false },
      select: { id: true, avatarUrl: true },
    });

    if (!user) {
      throw new AppError(404, "User not found");
    }

    if (!user.avatarUrl) {
      return;
    }

    await prisma.user.update({
      where: { id: userId },
      data: { avatarUrl: null },
    });

    try {
      await deleteFromS3(user.avatarUrl);
    } catch (error) {
      logger.warn(
        { userId, avatarUrl: user.avatarUrl, error },
        "Failed to delete avatar from S3 after DB update",
      );
    }

    logger.info({ userId }, "User avatar deleted");
  }

  static async suspend(id: string) {
    const user = await prisma.user.findFirst({
      where: { id, isDeleted: false },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        isDeleted: true,
        isSuspended: true,
      },
    });

    if (!user) {
      throw new AppError(404, "User not found");
    }

    const updated = await prisma.$transaction(async (tx) => {
      const updatedUser = await tx.user.update({
        where: { id },
        data: { isSuspended: true },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          isDeleted: true,
          isSuspended: true,
          role: true,
        },
      });

      await tx.refreshToken.deleteMany({ where: { userId: id } });

      return updatedUser;
    });

    await invalidateUserStatsCache(id);

    logger.info({ userId: id }, "User suspended by admin");

    return updated;
  }

  static async restore(id: string) {
    const user = await prisma.user.findFirst({
      where: { id, isDeleted: false },
      select: { id: true },
    });

    if (!user) {
      throw new AppError(404, "User not found");
    }

    const updated = await prisma.user.update({
      where: { id },
      data: { isSuspended: false },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        isDeleted: true,
        isSuspended: true,
        role: true,
      },
    });

    await invalidateUserStatsCache(id);

    logger.info({ userId: id }, "User restored by admin");

    return updated;
  }

  /** Queues OTP challenge for destination email and stores it in Redis. */
  static async requestEmailChange(userId: string, newEmail: string) {
    const OTP_TTL_SECONDS = 15 * 60;

    const user = await prisma.user.findFirst({
      where: { id: userId, isDeleted: false },
      select: { id: true, email: true, firstName: true },
    });
    if (!user) throw new AppError(404, "User not found");

    if (user.email.toLowerCase() === newEmail.toLowerCase()) {
      throw new AppError(400, "New email must be different from your current email");
    }

    const conflict = await prisma.user.findFirst({
      where: { email: newEmail, isDeleted: false },
      select: { id: true },
    });
    if (conflict) throw new AppError(409, "Email already in use");

    const otp = String(randomInt(0, 1_000_000)).padStart(6, "0");

    // Single active challenge per user; repeat requests rotate OTP and TTL.
    const redisKey = `email_change:${userId}`;
    await cacheClient.set(
      redisKey,
      JSON.stringify({ newEmail, otp }),
      "EX",
      OTP_TTL_SECONDS,
    );

    await emailQueue.add("email-change-otp", {
      newEmail,
      firstName: user.firstName,
      otp,
      expiresInMinutes: OTP_TTL_SECONDS / 60,
    });

    logger.info(
      { userId, newEmail },
      "Email change OTP requested",
    );
  }

  /** Applies verified email change and notifies previous mailbox. */
  static async confirmEmailChange(userId: string, otp: string) {
    const redisKey = `email_change:${userId}`;
    const raw = await cacheClient.get(redisKey);

    if (!raw) {
      throw new AppError(
        400,
        "No pending email change request found or it has expired. Please request a new code.",
      );
    }

    const { newEmail, otp: storedOtp } = JSON.parse(raw) as {
      newEmail: string;
      otp: string;
    };

    if (otp !== storedOtp) {
      throw new AppError(400, "Invalid or expired OTP");
    }

    const user = await prisma.user.findFirst({
      where: { id: userId, isDeleted: false },
      select: { id: true, email: true, firstName: true },
    });
    if (!user) throw new AppError(404, "User not found");

    // Re-check uniqueness to close race between OTP issuance and confirmation.
    const conflict = await prisma.user.findFirst({
      where: { email: newEmail, isDeleted: false },
      select: { id: true },
    });
    if (conflict) {
      await cacheClient.del(redisKey);
      throw new AppError(409, "Email already in use. Please request a new code.");
    }

    const oldEmail = user.email;

    await prisma.user.update({
      where: { id: userId },
      data: { email: newEmail },
    });

    await cacheClient.del(redisKey);

    // Security signal for potential account takeover.
    await emailQueue.add("email-changed-notification", {
      oldEmail,
      firstName: user.firstName,
      newEmail,
    });

    logger.info(
      { userId, oldEmail, newEmail },
      "User email successfully changed",
    );
  }

  /** Rotates password and revokes all refresh sessions. */
  static async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ) {
    const user = await prisma.user.findFirst({
      where: { id: userId, isDeleted: false },
      select: { id: true, email: true, firstName: true, passwordHash: true },
    });
    if (!user || !user.passwordHash) {
      throw new AppError(404, "User not found");
    }

    const isValidPassword = await bcrypt.compare(
      currentPassword,
      user.passwordHash,
    );
    if (!isValidPassword) {
      logger.warn(
        { userId, event: "password_change_failed" },
        "Invalid current password",
      );
      throw new AppError(401, "Current password is incorrect");
    }

    const isSamePassword = await bcrypt.compare(newPassword, user.passwordHash);
    if (isSamePassword) {
      throw new AppError(400, "New password must be different from current");
    }

    const newPasswordHash = await bcrypt.hash(newPassword, 12);

    await prisma.$transaction([
      prisma.user.update({
        where: { id: userId },
        data: { passwordHash: newPasswordHash },
      }),
      prisma.refreshToken.deleteMany({ where: { userId } }),
    ]);

    await emailQueue.add("password-changed-notification", {
      email: user.email,
      firstName: user.firstName,
      changedAtIso: new Date().toISOString(),
    });

    logger.info({ userId, email: user.email }, "Password changed successfully");

    return { success: true, message: "Password changed. Please login again." };
  }

  // TODO: Move account deletion to a dedicated transactional closure workflow.
  static async delete(id: string, password: string) {
    const user = await prisma.user.findFirst({
      where: { id, isDeleted: false },
      select: {
        id: true,
        email: true,
        firstName: true,
        avatarUrl: true,
        passwordHash: true,
      },
    });

    if (!user || !user.passwordHash) {
      throw new AppError(404, "User not found");
    }

    const isValidPassword = await bcrypt.compare(password, user.passwordHash);
    if (!isValidPassword) {
      logger.warn({ userId: id }, "Account deletion failed: invalid password");
      throw new AppError(401, "Invalid password");
    }

    const [activeBookingsCount, activePropertiesCount] = await Promise.all([
      prisma.booking.count({
        where: {
          userId: id,
          status: { in: ["PENDING", "CONFIRMED"] },
        },
      }),
      prisma.property.count({
        where: {
          ownerId: id,
          isActive: true,
        },
      }),
    ]);

    if (activeBookingsCount > 0) {
      throw new AppError(
        400,
        "Cannot delete account with active bookings. Cancel them first.",
      );
    }

    if (activePropertiesCount > 0) {
      throw new AppError(
        400,
        "Cannot delete account with active properties. Deactivate them first.",
      );
    }

    const deletedAt = new Date();

    await prisma.$transaction([
      prisma.user.update({
        where: { id },
        data: {
          isDeleted: true,
          deletedAt,
          email: `deleted_${id}@deleted.local`,
          passwordHash: null,
          phoneNumber: null,
          avatarUrl: null,
        },
      }),
      prisma.refreshToken.deleteMany({ where: { userId: id } }),
    ]);

    if (user.avatarUrl) {
      try {
        await deleteFromS3(user.avatarUrl);
      } catch (error) {
        logger.warn(
          { userId: id, avatarUrl: user.avatarUrl, error },
          "Failed to delete avatar from S3 after soft delete",
        );
      }
    }

    await emailQueue.add("account-deleted-notification", {
      email: user.email,
      firstName: user.firstName,
      deletedAtIso: deletedAt.toISOString(),
    });

    await invalidateUserStatsCache(id);

    logger.info({ userId: id }, "User account soft-deleted");

    // TODO: Emit immutable compliance audit event for account deletion.
  }

  /** Aggregates guest/host KPIs and caches the snapshot. */
  static async getUserStats(userId: string) {
    const cacheKey = getUserStatsCacheKey(userId);
    const cached = await cacheGet<{
      completedBookingsCount: number;
      completedNights: number;
      averageRatingAsGuest: number | null;
      averageRatingAsHost: number | null;
      listingsCount: number;
    }>(cacheKey);

    if (cached) {
      return cached;
    }

    const user = await prisma.user.findFirst({
      where: { id: userId, isDeleted: false },
      select: { id: true },
    });

    if (!user) {
      throw new AppError(404, "User not found");
    }

    const [completedBookings, guestRatingAggregate, hostRatingAggregate, listingsCount] =
      await Promise.all([
        prisma.booking.findMany({
          where: {
            userId,
            status: "COMPLETED",
          },
          select: {
            checkIn: true,
            checkOut: true,
          },
        }),
        prisma.review.aggregate({
          where: { userId },
          _avg: { rating: true },
        }),
        prisma.review.aggregate({
          where: {
            property: {
              ownerId: userId,
            },
          },
          _avg: { rating: true },
        }),
        prisma.property.count({
          where: { ownerId: userId },
        }),
      ]);

    const completedNights = completedBookings.reduce(
      (sum, booking) =>
        sum + Math.max(0, calculateNights(booking.checkIn, booking.checkOut)),
      0,
    );

    const stats = {
      completedBookingsCount: completedBookings.length,
      completedNights,
      averageRatingAsGuest:
        guestRatingAggregate._avg.rating !== null
          ? Number(guestRatingAggregate._avg.rating)
          : null,
      averageRatingAsHost:
        hostRatingAggregate._avg.rating !== null
          ? Number(hostRatingAggregate._avg.rating)
          : null,
      listingsCount,
    };

    await cacheSet(cacheKey, stats, USER_STATS_CACHE_TTL_SECONDS);

    return stats;
  }
}
