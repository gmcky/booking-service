import type { Request, Response, CookieOptions } from "express";
import { AuthService } from "./auth.service.js";
import { env } from "../../config/env.js";
import { AppError } from "../../shared/middlewares/error.handler.js";
import { parseExpiry } from "../../shared/utils/time.js";
import type { VerifyEmailInput, ForgotPasswordInput, ResetPasswordInput } from "./auth.types.js";

const REFRESH_TOKEN_COOKIE_NAME = "refreshToken";
const REFRESH_TOKEN_COOKIE_OPTIONS: CookieOptions = {
  httpOnly: true,
  secure: env.NODE_ENV === "production",
  sameSite: env.NODE_ENV === "production" ? "strict" : "lax",
  path: `/api/${env.API_VERSION}/auth`,
  maxAge: parseExpiry(env.JWT_REFRESH_EXPIRES_IN),
};

/**
 * @server\src\api.routes.ts
 * @route POST /api/v1/auth/register
 * @access Public
 * @security Rate-limited at HTTP layer.
 */
export async function register(req: Request, res: Response) {
  const result = await AuthService.register(req.body, {
    ip: req.ip,
    userAgent: req.get("user-agent") || undefined,
  });
  const { refreshToken, ...responsePayload } = result;

  // Off-payload refresh token reduces client-side exfiltration surface.
  setRefreshTokenCookie(res, refreshToken);

  res.status(201).json(responsePayload);
}

/**
 * @server\src\api.routes.ts
 * @route POST /api/v1/auth/login
 * @access Public
 * @security Rate-limited + lockout-backed.
 */
export async function login(req: Request, res: Response) {
  const result = await AuthService.login(req.body, {
    ip: req.ip,
    userAgent: req.get("user-agent") || undefined,
  });
  const { refreshToken, ...responsePayload } = result;

  setRefreshTokenCookie(res, refreshToken);

  res.json(responsePayload);
}

/**
 * @server\src\api.routes.ts
 * @route POST /api/v1/auth/logout
 * @access Private
 * @security Requires refresh token cookie.
 */
export async function logout(req: Request, res: Response) {
  const refreshToken = extractRefreshToken(req);

  await AuthService.logout(refreshToken, {
    ip: req.ip,
    userAgent: req.get("user-agent") || undefined,
  });

  clearRefreshTokenCookie(res);

  res.status(204).send();
}

/**
 * @server\src\api.routes.ts
 * @route POST /api/v1/auth/refresh
 * @access Public
 * @security Rotation + reuse-detection path.
 */
export async function refreshToken(req: Request, res: Response) {
  const currentRefreshToken = extractRefreshToken(req);

  const result = await AuthService.refreshToken(currentRefreshToken, {
    ip: req.ip,
    userAgent: req.get("user-agent") || undefined,
  });
  const { refreshToken: rotatedRefreshToken, ...responsePayload } = result;

  setRefreshTokenCookie(res, rotatedRefreshToken);

  res.json(responsePayload);
}

/**
 * @server\src\api.routes.ts
 * @route POST /api/v1/auth/verify-email
 * @access Public
 * @body { token: string }
 */
export async function verifyEmail(req: Request, res: Response) {
  const { token } = req.body as VerifyEmailInput;

  await AuthService.verifyEmail(token);

  res.status(204).send();
}

/**
 * @server\src\api.routes.ts
 * @route POST /api/v1/auth/resend-verification
 * @access Private
 * @security Bearer token required. Rate-limited to 3/hour.
 */
export async function resendVerification(req: Request, res: Response) {
  const userId = req.user!.id;

  await AuthService.resendVerificationEmail(userId);

  res.status(204).send();
}

/**
 * @server\src\api.routes.ts
 * @route POST /api/v1/auth/forgot-password
 * @access Public
 * @body { email: string }
 * @security Rate-limited to 3/hour per email. Always 204 — never discloses
 * whether the account exists.
 */
export async function forgotPassword(req: Request, res: Response) {
  const { email } = req.body as ForgotPasswordInput;

  await AuthService.forgotPassword(email);

  res.status(204).send();
}

/**
 * @server\src\api.routes.ts
 * @route POST /api/v1/auth/reset-password
 * @access Public
 * @body { token: string, newPassword: string }
 */
export async function resetPassword(req: Request, res: Response) {
  const { token, newPassword } = req.body as ResetPasswordInput;

  await AuthService.resetPassword(token, newPassword);

  res.status(204).send();
}

function setRefreshTokenCookie(res: Response, token: string) {
  res.cookie(REFRESH_TOKEN_COOKIE_NAME, token, REFRESH_TOKEN_COOKIE_OPTIONS);
}

function clearRefreshTokenCookie(res: Response) {
  const { path, httpOnly, sameSite, secure } = REFRESH_TOKEN_COOKIE_OPTIONS;
  res.clearCookie(REFRESH_TOKEN_COOKIE_NAME, {
    path,
    httpOnly,
    sameSite,
    secure,
  });
}

function extractRefreshToken(req: Request): string {
  const token = req.cookies?.[REFRESH_TOKEN_COOKIE_NAME];
  if (!token) {
    throw new AppError(401, "No refresh token provided");
  }
  return token;
}
