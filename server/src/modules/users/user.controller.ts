import type { Request, Response } from "express";
import type { AuthenticatedRequest } from "../../shared/types/index.js";
import { getIdParam } from "../../shared/utils/request.helpers.js";
import { UserService } from "./user.service.js";
import { logger } from "../../shared/lib/logger.js";
import type {
  RequestEmailChangeInput,
  ConfirmEmailChangeInput,
} from "./user.types.js";

// TODO: Add multer middleware for avatar upload
// import multer from 'multer';
// import { AppError } from '../../shared/middlewares/error.handler.js';
//
// const upload = multer({
//   storage: multer.memoryStorage(), // Store in memory for processing
//   limits: {
//     fileSize: 2 * 1024 * 1024, // 2MB max
//     files: 1 // Only 1 file per request
//   },
//   fileFilter: (req, file, cb) => {
//     // Only accept images
//     if (!file.mimetype.startsWith('image/')) {
//       return cb(new AppError(400, 'Only image files allowed'));
//     }
//     cb(null, true);
//   }
// });
//
// // Apply to route:
// // router.patch('/me', authenticate, upload.single('avatar'), updateCurrentUser)

/**
 * Get current authenticated user's profile
 * @route GET /api/v1/users/me
 * @access Private
 */

export async function getCurrentUser(req: AuthenticatedRequest, res: Response) {
  const userId = req.user!.id;
  const user = await UserService.getById(userId);
  res.json(user);
}

/**
 * Update current user's profile
 * @route PATCH /api/v1/users/me
 * @access Private
 * @body { firstName?, lastName?, avatar? }
 */
export async function updateCurrentUser(
  req: AuthenticatedRequest,
  res: Response,
) {
  // TODO: CRITICAL SECURITY CHECK - User can only update their own profile
  // This is handled by using req.user.id (from JWT) directly
  // NEVER use req.params.id or req.body.id for authorization!
  const userId = req.user!.id;

  // TODO: Validate request body with Zod schema
  // Schema should allow optional fields:
  // - firstName: string, min 1 char
  // - lastName: string, min 1 char
  // - phoneNumber: regex validation
  // - dateOfBirth: date, must be >18 years old
  //
  // DO NOT allow updating:
  // - email (requires verification flow)
  // - role (security risk!)
  // - password (use separate endpoint)

  // TODO: Handle avatar upload if file is provided
  // Avatar comes from multer middleware as req.file
  //
  // let updateData = { ...req.body };
  //
  // if (req.file) {
  //   // File is now in memory buffer (req.file.buffer)
  //   // Pass to service for processing (resize, upload to S3)
  //   updateData.avatarFile = req.file;
  // }

  const user = await UserService.update(userId, req.body);

  // TODO: Log profile update
  // logger.info({
  //   userId,
  //   changedFields: Object.keys(req.body),
  //   hasAvatar: !!req.file
  // }, 'User profile updated');

  res.json(user);
}

/**
 * Delete current user's account
 * @route DELETE /api/v1/users/me
 * @access Private
 */
export async function deleteCurrentUser(
  req: AuthenticatedRequest,
  res: Response,
) {
  // TODO: require explicit delete confirmation (password or one-time token).
  // TODO: SECURITY - User can only delete their own account
  const userId = req.user!.id;

  // TODO: Add confirmation requirement
  // Require user to provide password or confirmation token
  // This prevents accidental deletions
  //
  // const { password } = req.body;
  // if (!password) {
  //   throw new AppError(400, 'Password confirmation required');
  // }
  //
  // // Verify password
  // const user = await prisma.user.findUnique({ where: { id: userId } });
  // const isValid = await bcrypt.compare(password, user.passwordHash);
  // if (!isValid) {
  //   throw new AppError(401, 'Invalid password');
  // }

  await UserService.delete(userId);
  res.status(204).send();
}

/**
 * Step 1: Request an email change.
 * Sends a 6-digit OTP to the NEW email address.
 * @route POST /api/v1/users/me/email/request-change
 * @access Private
 * @body { newEmail: string }
 */
export async function requestEmailChange(
  req: AuthenticatedRequest,
  res: Response,
) {
  const userId = req.user!.id;
  const { newEmail } = req.body as RequestEmailChangeInput;

  await UserService.requestEmailChange(userId, newEmail);

  res.json({
    message:
      "A verification code has been sent to your new email address. It expires in 15 minutes.",
  });
}

/**
 * Step 2: Confirm the email change using the OTP.
 * @route POST /api/v1/users/me/email/confirm-change
 * @access Private
 * @body { otp: string }
 */
export async function confirmEmailChange(
  req: AuthenticatedRequest,
  res: Response,
) {
  const userId = req.user!.id;
  const { otp } = req.body as ConfirmEmailChangeInput;

  await UserService.confirmEmailChange(userId, otp);

  res.json({ message: "Email address updated successfully." });
}

/**
 * Change current user's password
 * @route POST /api/v1/users/me/change-password
 * @access Private
 * @body { currentPassword: string, newPassword: string }
 */
export async function changePassword(req: AuthenticatedRequest, res: Response) {
  // TODO: implement endpoint before exposing it on public routes (now returns 501).
  // TODO: Implement password change controller
  // CRITICAL: This must be a separate endpoint, NOT part of updateProfile
  // Reason: Password changes should always require current password
  //
  // Workflow:
  // 1. Validate request body with Zod
  //    - currentPassword: string, required
  //    - newPassword: string, min 12 chars, complex requirements
  //    - confirmPassword: string, must match newPassword
  //
  // 2. Call UserService.changePassword()
  //
  // 3. Return success message (tokens are invalidated, user must login again)
  //
  // const userId = req.user!.id;
  // const { currentPassword, newPassword } = req.body;
  //
  // await UserService.changePassword(userId, currentPassword, newPassword);
  //
  // // Clear refresh token cookie (force re-login)
  // res.clearCookie('refreshToken');
  //
  // res.json({
  //   success: true,
  //   message: 'Password changed successfully. Please login again.'
  // });

  res.status(501).json({ message: "Not implemented" });
}

/**
 * Get all users (Admin only)
 * @route GET /api/v1/users?page=1&limit=10
 * @access Private (Admin)
 */
export async function getAllUsers(req: Request, res: Response) {
  // TODO: Add authorization check - only ADMIN can list all users
  // Apply authorize('ADMIN') middleware to route
  //
  // if (req.user?.role !== 'ADMIN') {
  //   throw new AppError(403, 'Admin access required');
  // }

  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 10;

  // TODO: Add filtering options for admins
  // - Filter by role (USER, HOST, ADMIN)
  // - Filter by registration date range
  // - Search by email or name
  // - Filter by account status (active, deleted, suspended)

  const result = await UserService.getAll({ page, limit });
  res.json(result);
}

/**
 * Get user by ID (Public - for viewing host profiles)
 * @route GET /api/v1/users/:id
 * @access Public
 */
export async function getUserById(req: Request, res: Response) {
  const id = getIdParam(req);

  // TODO: Return limited public info (not email, not personal details)
  // Public profile should show:
  // - firstName, lastName (or display name)
  // - Avatar URL
  // - Member since date
  // - Number of properties (if host)
  // - Average rating
  // - Bio/description (add to schema)
  //
  // Should NOT show:
  // - Email (privacy)
  // - Phone number (privacy)
  // - Role (security)
  // - Last login (security)

  const user = await UserService.getById(id);
  res.json(user);
}

// TODO: Add endpoint for getting user statistics
// export async function getUserStats(req: AuthenticatedRequest, res: Response) {
//   const userId = req.user!.id;
//   const stats = await UserService.getUserStats(userId);
//   res.json(stats);
// }

// TODO: Add endpoint for uploading/deleting avatar separately
// export async function uploadAvatar(req: AuthenticatedRequest, res: Response) {
//   const userId = req.user!.id;
//   const avatarUrl = await UserService.uploadAvatar(userId, req.file);
//   res.json({ avatarUrl });
// }
//
// export async function deleteAvatar(req: AuthenticatedRequest, res: Response) {
//   const userId = req.user!.id;
//   await UserService.deleteAvatar(userId);
//   res.status(204).send();
// }
