import type { Request, Response, CookieOptions } from "express";
import type { AuthenticatedRequest } from "../../shared/types/index.js";
import { getIdParam } from "../../shared/utils/request.helpers.js";
import { UserService } from "./user.service.js";
import { logger } from "../../shared/lib/logger.js";
import { env } from "../../config/env.js";
import type {
  UpdateUserInput,
  DeleteCurrentUserInput,
  ChangePasswordInput,
  GetUsersQueryInput,
  RequestEmailChangeInput,
  ConfirmEmailChangeInput,
} from "./user.types.js";

const REFRESH_TOKEN_COOKIE_NAME = "refreshToken";
const REFRESH_TOKEN_CLEAR_OPTIONS: CookieOptions = {
  httpOnly: true,
  secure: env.NODE_ENV === "production",
  sameSite: env.NODE_ENV === "production" ? "strict" : "lax",
  path: `/api/${env.API_VERSION}/auth`,
};

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
  const user = await UserService.getById(userId, { mode: "self" });
  res.json(user);
}

export async function getCurrentUserStats(
  req: AuthenticatedRequest,
  res: Response,
) {
  const userId = req.user!.id;
  const stats = await UserService.getUserStats(userId);
  res.json(stats);
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

  const user = await UserService.update(userId, req.body as UpdateUserInput);

  if (req.file) {
    const avatarUrl = await UserService.uploadAvatar(userId, req.file);
    res.json({ ...user, avatarUrl });
    return;
  }

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

  const { password } = req.body as DeleteCurrentUserInput;

  await UserService.delete(userId, password);
  res.status(204).send();
}

export async function deleteAvatar(req: AuthenticatedRequest, res: Response) {
  const userId = req.user!.id;
  await UserService.deleteAvatar(userId);
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
  const userId = req.user!.id;
  const { currentPassword, newPassword } = req.body as ChangePasswordInput;

  await UserService.changePassword(userId, currentPassword, newPassword);

  // Force client re-authentication after all refresh sessions are revoked.
  res.clearCookie(REFRESH_TOKEN_COOKIE_NAME, REFRESH_TOKEN_CLEAR_OPTIONS);

  res.json({
    success: true,
    message: "Password changed successfully. Please login again.",
  });
}

/**
 * Get all users (Admin only)
 * @route GET /api/v1/users?page=1&limit=10
 * @access Private (Admin)
 */
export async function getAllUsers(req: Request, res: Response) {
  const query = req.query as unknown as GetUsersQueryInput;

  const result = await UserService.getAll({
    page: query.page,
    limit: query.limit,
    role: query.role,
    dateFrom: query.dateFrom,
    dateTo: query.dateTo,
    search: query.search,
    isDeleted: query.isDeleted,
  });
  res.json(result);
}

/**
 * Get user by ID (Public - for viewing host profiles)
 * @route GET /api/v1/users/:id
 * @access Public
 */
export async function getUserById(req: Request, res: Response) {
  const id = getIdParam(req);

  const user = await UserService.getById(id, { mode: "public" });
  res.json(user);
}

export async function suspendUser(req: Request, res: Response) {
  const id = getIdParam(req);
  const user = await UserService.suspend(id);
  res.json(user);
}

export async function restoreUser(req: Request, res: Response) {
  const id = getIdParam(req);
  const user = await UserService.restore(id);
  res.json(user);
}

// TODO: Add dedicated upload avatar endpoint if needed
