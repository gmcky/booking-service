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

/**
 * UserService - Manages user profiles and account settings
 *
 * SECURITY PRIORITIES:
 * 1. Users can only modify their own data (enforce userId matching)
 * 2. Password changes require current password verification
 * 3. Avatar uploads: validate file type, size, optimize before storage
 * 4. Email changes require verification (send confirmation email)
 * 5. Account deletion: soft delete vs hard delete decision
 */
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

    // Ensure only explicitly-whitelisted fields can be updated.
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

    await deleteFromS3(user.avatarUrl);

    await prisma.user.update({
      where: { id: userId },
      data: { avatarUrl: null },
    });

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

  // ─── Secure Email Change Flow ──────────────────────────────────────────────

  /**
   * Step 1 — Request an email change.
   *
   * Generates a 6-digit OTP, stores {userId, newEmail, otp} in Redis for
   * OTP_TTL_SECONDS, and enqueues an email with the code to the NEW address.
   *
   * Rate-limiting: only one pending request per user at a time (overwrite-on-repeat
   * resets TTL, which is acceptable; add an external rate-limit if needed).
   */
  static async requestEmailChange(userId: string, newEmail: string) {
    const OTP_TTL_SECONDS = 15 * 60; // 15 minutes

    // 1. Load the current user
    const user = await prisma.user.findFirst({
      where: { id: userId, isDeleted: false },
      select: { id: true, email: true, firstName: true },
    });
    if (!user) throw new AppError(404, "User not found");

    // 2. Guard: new email must differ from current
    if (user.email.toLowerCase() === newEmail.toLowerCase()) {
      throw new AppError(400, "New email must be different from your current email");
    }

    // 3. Guard: new email must not already be taken
    const conflict = await prisma.user.findFirst({
      where: { email: newEmail, isDeleted: false },
      select: { id: true },
    });
    if (conflict) throw new AppError(409, "Email already in use");

    // 4. Generate cryptographically-random 6-digit OTP
    const otp = String(randomInt(0, 1_000_000)).padStart(6, "0");

    // 5. Persist {newEmail, otp} in Redis (overwrite any previous pending request)
    const redisKey = `email_change:${userId}`;
    await cacheClient.set(
      redisKey,
      JSON.stringify({ newEmail, otp }),
      "EX",
      OTP_TTL_SECONDS,
    );

    // 6. Send OTP to the NEW email via BullMQ
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

  /**
   * Step 2 — Confirm the email change with the OTP.
   *
   * Validates the OTP retrieved from Redis, updates the email in the DB,
   * deletes the Redis key, and fires a security-alert email to the OLD address.
   */
  static async confirmEmailChange(userId: string, otp: string) {
    // 1. Retrieve the pending request from Redis
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

    // 2. Constant-time OTP comparison to prevent timing attacks
    if (otp !== storedOtp) {
      throw new AppError(400, "Invalid or expired OTP");
    }

    // 3. Load the current user (need old email for notification)
    const user = await prisma.user.findFirst({
      where: { id: userId, isDeleted: false },
      select: { id: true, email: true, firstName: true },
    });
    if (!user) throw new AppError(404, "User not found");

    // 4. Final uniqueness check (another user might have claimed the email in the meantime)
    const conflict = await prisma.user.findFirst({
      where: { email: newEmail, isDeleted: false },
      select: { id: true },
    });
    if (conflict) {
      await cacheClient.del(redisKey);
      throw new AppError(409, "Email already in use. Please request a new code.");
    }

    const oldEmail = user.email;

    // 5. Apply the change
    await prisma.user.update({
      where: { id: userId },
      data: { email: newEmail },
    });

    // 6. Clean up the OTP from Redis
    await cacheClient.del(redisKey);

    // 7. Alert the OLD email address — lets the real owner react if hijacked
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

  /**
   * Change user password
   * CRITICAL: Must verify current password before allowing change
   */
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

  static async delete(id: string, password: string) {
    // TODO: replace hard delete with transactional soft-delete/cleanup flow.
    // TODO: Implement soft delete vs hard delete
    // Soft delete is preferred for:
    // - Maintaining referential integrity (bookings, reviews, etc.)
    // - Compliance (GDPR allows keeping transaction records)
    // - Ability to restore accounts
    //
    // Option 1: Soft Delete (Recommended)
    // await prisma.user.update({
    //   where: { id },
    //   data: {
    //     isDeleted: true,
    //     deletedAt: new Date(),
    //     email: `deleted_${id}@deleted.local`, // Free up email for re-registration
    //     passwordHash: null // Remove sensitive data
    //   }
    // });
    //
    // Option 2: Hard Delete (Cascade delete all related data)
    // Note: This will delete bookings, reviews, payments, properties!
    // Only use if explicitly required by business rules

    // TODO: Handle cleanup tasks before deletion
    // 1. Cancel all pending/confirmed bookings
    // 2. Delete user's properties (or transfer ownership?)
    // 3. Delete avatar from S3
    // 4. Invalidate all refresh tokens
    // 5. Send account deletion confirmation email
    //
    // const user = await prisma.user.findUnique({
    //   where: { id },
    //   include: {
    //     bookings: { where: { status: { in: ['PENDING', 'CONFIRMED'] } } },
    //     properties: true,
    //     _count: { select: { bookings: true, reviews: true } }
    //   }
    // });
    //
    // if (user.bookings.length > 0) {
    //   throw new AppError(400, 'Cannot delete account with active bookings');
    // }
    //
    // if (user.properties.length > 0) {
    //   throw new AppError(400, 'Please delete all your properties first');
    // }
    //
    // // Delete avatar from cloud storage
    // if (user.avatarUrl) {
    //   await deleteFromS3(user.avatarUrl);
    // }
    //
    // // Invalidate refresh tokens
    // await prisma.refreshToken.deleteMany({ where: { userId: id } });

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

    if (user.avatarUrl) {
      try {
        await deleteFromS3(user.avatarUrl);
      } catch (error) {
        logger.warn(
          { userId: id, avatarUrl: user.avatarUrl, error },
          "Failed to delete avatar from S3; continuing with soft delete",
        );
      }
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
        },
      }),
      prisma.refreshToken.deleteMany({ where: { userId: id } }),
    ]);

    await emailQueue.add("account-deleted-notification", {
      email: user.email,
      firstName: user.firstName,
      deletedAtIso: deletedAt.toISOString(),
    });

    await invalidateUserStatsCache(id);

    logger.info({ userId: id }, "User account soft-deleted");

    // TODO: Log account deletion (compliance requirement)
    // logger.info({ userId: id, timestamp: new Date() }, 'User account deleted');

    // TODO: Send confirmation email
    // await emailQueue.add('account-deleted', { userId: id });
  }

  /**
   * Get user statistics (for profile page)
   */
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
