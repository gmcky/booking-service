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
// import bcrypt from 'bcrypt';

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
    // TODO: Security validation - already handled in controller
    // Controller must verify: req.user.id === id
    // This prevents users from updating other users' profiles

    // TODO: Handle avatar upload if file is provided
    // Avatar upload workflow:
    // 1. Receive file from multer middleware (req.file)
    // 2. Validate file type (jpg, png, webp only)
    // 3. Validate file size (max 2MB)
    // 4. Resize/crop to standard size (200x200px)
    // 5. Upload to S3/Cloudinary
    // 6. Delete old avatar from S3 (if exists)
    // 7. Store new URL in database
    //
    // Example:
    // if (data.avatarFile) {
    //   // Validate
    //   if (!['image/jpeg', 'image/png', 'image/webp'].includes(data.avatarFile.mimetype)) {
    //     throw new AppError(400, 'Invalid image format');
    //   }
    //   if (data.avatarFile.size > 2 * 1024 * 1024) {
    //     throw new AppError(400, 'Image too large (max 2MB)');
    //   }
    //
    //   // Get existing avatar to delete later
    //   const existingUser = await prisma.user.findUnique({
    //     where: { id },
    //     select: { avatarUrl: true }
    //   });
    //
    //   // Resize and upload
    //   const resizedBuffer = await sharp(data.avatarFile.buffer)
    //     .resize(200, 200, { fit: 'cover' })
    //     .webp({ quality: 90 })
    //     .toBuffer();
    //
    //   const avatarUrl = await uploadToS3({
    //     buffer: resizedBuffer,
    //     key: `avatars/${id}/${Date.now()}.webp`,
    //     contentType: 'image/webp'
    //   });
    //
    //   // Delete old avatar
    //   if (existingUser.avatarUrl) {
    //     await deleteFromS3(existingUser.avatarUrl);
    //   }
    //
    //   data.avatarUrl = avatarUrl;
    // }

    // TODO: Handle email change with verification
    // Email changes should require:
    // 1. Send verification email to NEW email address
    // 2. Store pending email in separate field (pendingEmail)
    // 3. Only update email after user clicks verification link
    // 4. Prevent duplicate emails (check uniqueness)
    //
    // if (data.email && data.email !== currentUser.email) {
    //   const exists = await prisma.user.findUnique({ where: { email: data.email } });
    //   if (exists) throw new AppError(409, 'Email already in use');
    //
    //   // Don't update email immediately, set as pending
    //   await prisma.user.update({
    //     where: { id },
    //     data: { pendingEmail: data.email }
    //   });
    //
    //   // Send verification email
    //   await emailQueue.add('verify-email-change', {
    //     userId: id,
    //     newEmail: data.email,
    //     verificationToken: generateToken()
    //   });
    //
    //   delete data.email; // Don't update email in this request
    // }

    const user = await prisma.user.update({
      where: { id },
      data: omitUndefined(data),
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        // TODO: Add avatarUrl to select once field is added to schema
        // avatarUrl: true,
      },
    });

    // TODO: Log profile update (for security auditing)
    // logger.info({
    //   event: 'profile_updated',
    //   userId: id,
    //   changedFields: Object.keys(data)
    // }, 'User profile updated');

    return user;
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
