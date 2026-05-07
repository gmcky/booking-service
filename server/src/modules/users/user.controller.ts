import type { Request, Response, CookieOptions } from "express";
import type { AuthenticatedRequest } from "../../shared/types/index.js";
import { getIdParam } from "../../shared/utils/request.helpers.js";
import { UserService } from "./user.service.js";
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

/**
 * @route GET /api/v1/users/me
 * @access Private
 * @security Bearer token required.
 */

export async function getCurrentUser(req: AuthenticatedRequest, res: Response) {
  const userId = req.user!.id;
  const user = await UserService.getById(userId, { mode: "self" });
  res.json(user);
}

/**
 * @route GET /api/v1/users/me/stats
 * @access Private
 * @security Bearer token required.
 */
export async function getCurrentUserStats(
  req: AuthenticatedRequest,
  res: Response,
) {
  const userId = req.user!.id;
  const stats = await UserService.getUserStats(userId);
  res.json(stats);
}

/**
 * @route PATCH /api/v1/users/me
 * @access Private
 * @security Bearer token required.
 * @body { firstName?, lastName?, avatar? }
 */
export async function updateCurrentUser(
  req: AuthenticatedRequest,
  res: Response,
) {
  // Auth anchor: self-update routes derive subject from JWT only.
  const userId = req.user!.id;

  const user = await UserService.update(userId, req.body as UpdateUserInput);

  if (req.file) {
    await UserService.uploadAvatar(userId, req.file);
    res.status(202).json({ message: "Avatar upload accepted, processing in background" });
    return;
  }

  res.json(user);
}

// TODO: Enforce step-up confirmation token for account deletion.
/**
 * @route DELETE /api/v1/users/me
 * @access Private
 * @security Bearer token required.
 */
export async function deleteCurrentUser(
  req: AuthenticatedRequest,
  res: Response,
) {
  const userId = req.user!.id;

  const { password } = req.body as DeleteCurrentUserInput;

  await UserService.delete(userId, password);
  res.status(204).send();
}

/**
 * @route DELETE /api/v1/users/me/avatar
 * @access Private
 * @security Bearer token required.
 */
export async function deleteAvatar(req: AuthenticatedRequest, res: Response) {
  const userId = req.user!.id;
  await UserService.deleteAvatar(userId);
  res.status(204).send();
}

/**
 * @route POST /api/v1/users/me/email/request-change
 * @access Private
 * @security Bearer token required.
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
 * @route POST /api/v1/users/me/email/confirm-change
 * @access Private
 * @security Bearer token required.
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
 * @route POST /api/v1/users/me/change-password
 * @access Private
 * @security Bearer token required.
 * @body { currentPassword: string, newPassword: string }
 */
export async function changePassword(req: AuthenticatedRequest, res: Response) {
  const userId = req.user!.id;
  const { currentPassword, newPassword } = req.body as ChangePasswordInput;

  await UserService.changePassword(userId, currentPassword, newPassword);

  // Refresh sessions are revoked in service; clear cookie to avoid phantom refresh attempts.
  res.clearCookie(REFRESH_TOKEN_COOKIE_NAME, REFRESH_TOKEN_CLEAR_OPTIONS);

  res.json({
    success: true,
    message: "Password changed successfully. Please login again.",
  });
}

/**
 * @route GET /api/v1/users?page=1&limit=10
 * @access Private (Admin)
 * @security Bearer token required + ADMIN role.
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
 * @route GET /api/v1/users/:id
 * @access Public
 */
export async function getUserById(req: Request, res: Response) {
  const id = getIdParam(req);

  const user = await UserService.getById(id, { mode: "public" });
  res.json(user);
}

/**
 * @route PATCH /api/v1/users/:id/suspend
 * @access Private (Admin)
 * @security Bearer token required + ADMIN role.
 */
export async function suspendUser(req: Request, res: Response) {
  const id = getIdParam(req);
  const user = await UserService.suspend(id);
  res.json(user);
}

/**
 * @route PATCH /api/v1/users/:id/restore
 * @access Private (Admin)
 * @security Bearer token required + ADMIN role.
 */
export async function restoreUser(req: Request, res: Response) {
  const id = getIdParam(req);
  const user = await UserService.restore(id);
  res.json(user);
}
