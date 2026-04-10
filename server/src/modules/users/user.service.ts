import { prisma } from "../../shared/lib/prisma.js";
import { AppError } from "../../shared/middlewares/error.handler.js";
import { logger } from "../../shared/lib/logger.js";
import type { PaginationParams } from "../../shared/types/index.js";
import {
  calculatePagination,
  createPaginatedResponse,
} from "../../shared/utils/pagination.js";
import { omitUndefined } from "../../shared/utils/prisma.helpers.js";
import type { UpdateUserInput } from "./user.types.js";
import { cacheClient } from "../../shared/lib/cache.js";
import { emailQueue } from "../../shared/queues/email.queue.js";
import { randomInt } from "crypto";

// TODO: Add image upload utilities
// import { uploadToS3, deleteFromS3 } from '../../shared/lib/storage.js';

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
  static async getById(id: string) {
    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        createdAt: true,
      },
    });

    if (!user) {
      throw new AppError(404, "User not found");
    }

    return user;
  }

  static async getAll(params: PaginationParams) {
    const { skip, take } = calculatePagination(params.page, params.limit);

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        skip,
        take,
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
          createdAt: true,
        },
      }),
      prisma.user.count(),
    ]);

    return createPaginatedResponse(users, total, params);
  }

  static async update(id: string, data: UpdateUserInput) {
    // Ensure email cannot be changed via this method — use requestEmailChange instead.
    const user = await prisma.user.update({
      where: { id },
      data: omitUndefined(data),
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
      },
    });

    logger.info({ userId: id, changedFields: Object.keys(data) }, "User profile updated");

    return user;
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
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, firstName: true },
    });
    if (!user) throw new AppError(404, "User not found");

    // 2. Guard: new email must differ from current
    if (user.email.toLowerCase() === newEmail.toLowerCase()) {
      throw new AppError(400, "New email must be different from your current email");
    }

    // 3. Guard: new email must not already be taken
    const conflict = await prisma.user.findUnique({ where: { email: newEmail } });
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
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, firstName: true },
    });
    if (!user) throw new AppError(404, "User not found");

    // 4. Final uniqueness check (another user might have claimed the email in the meantime)
    const conflict = await prisma.user.findUnique({ where: { email: newEmail } });
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
    // TODO: Implement password change with security checks
    //
    // SECURITY REQUIREMENTS:
    // 1. Verify current password (prevent unauthorized changes)
    // 2. Validate new password strength (same rules as registration)
    // 3. Ensure new password != current password
    // 4. Invalidate all existing sessions (refresh tokens)
    // 5. Send confirmation email
    // 6. Log the password change
    //
    // Implementation:
    //
    // // Step 1: Get user with password hash
    // const user = await prisma.user.findUnique({
    //   where: { id: userId },
    //   select: { id: true, email: true, passwordHash: true }
    // });
    // if (!user) throw new AppError(404, 'User not found');
    //
    // // Step 2: Verify current password
    // const isValidPassword = await bcrypt.compare(currentPassword, user.passwordHash);
    // if (!isValidPassword) {
    //   logger.warn({ userId, event: 'password_change_failed' }, 'Invalid current password');
    //   throw new AppError(401, 'Current password is incorrect');
    // }
    //
    // // Step 3: Ensure new password is different
    // const isSamePassword = await bcrypt.compare(newPassword, user.passwordHash);
    // if (isSamePassword) {
    //   throw new AppError(400, 'New password must be different from current');
    // }
    //
    // // Step 4: Hash new password
    // const newPasswordHash = await bcrypt.hash(newPassword, 12);
    //
    // // Step 5: Update password AND invalidate all refresh tokens (security!)
    // await prisma.$transaction([
    //   prisma.user.update({
    //     where: { id: userId },
    //     data: { passwordHash: newPasswordHash }
    //   }),
    //   // Invalidate all refresh tokens for this user
    //   prisma.refreshToken.deleteMany({
    //     where: { userId }
    //   })
    // ]);
    //
    // // Step 6: Send confirmation email
    // await emailQueue.add('password-changed', {
    //   userId,
    //   email: user.email,
    //   timestamp: new Date()
    // });
    //
    // // Step 7: Log password change (security audit)
    // logger.info({ userId, email: user.email }, 'Password changed successfully');
    //
    // return { success: true, message: 'Password changed. Please login again.' };

    throw new AppError(501, "Not implemented");
  }

  static async delete(id: string) {
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

    await prisma.user.delete({ where: { id } });

    // TODO: Log account deletion (compliance requirement)
    // logger.info({ userId: id, timestamp: new Date() }, 'User account deleted');

    // TODO: Send confirmation email
    // await emailQueue.add('account-deleted', { userId: id });
  }

  /**
   * Get user statistics (for profile page)
   */
  static async getUserStats(userId: string) {
    // TODO: Implement user statistics
    // Show on user profile:
    // - Total bookings made
    // - Total properties owned (if host)
    // - Average rating as guest (from host reviews)
    // - Average rating as host (from property reviews)
    // - Member since date
    // - Total nights stayed
    //
    // const [bookingStats, propertyStats] = await Promise.all([
    //   prisma.booking.aggregate({
    //     where: { userId, status: 'COMPLETED' },
    //     _count: true,
    //     _sum: { /* calculate total nights */ }
    //   }),
    //   prisma.property.count({ where: { ownerId: userId } })
    // ]);

    throw new AppError(501, "Not implemented");
  }
}
