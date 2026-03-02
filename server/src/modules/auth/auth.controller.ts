import type { Request, Response, CookieOptions } from "express";
import { AuthService } from "./auth.service.js";
import { env } from "../../config/env.js";
import { AppError } from "../../shared/middlewares/error.handler.js";
import { parseExpiry } from "../../shared/utils/time.js";

const REFRESH_TOKEN_COOKIE_NAME = "refreshToken";
const REFRESH_TOKEN_COOKIE_OPTIONS: CookieOptions = {
  httpOnly: true,
  secure: env.NODE_ENV === "production",
  sameSite: env.NODE_ENV === "production" ? "strict" : "lax",
  path: `/api/${env.API_VERSION}/auth`,
  maxAge: parseExpiry(env.JWT_REFRESH_EXPIRES_IN),
};

/**
 * Register a new user
 * @route POST /api/v1/auth/register
 * @access Public
 * @security TODO: Add rate limiting (max 5 registrations per IP per hour)
 */
export async function register(req: Request, res: Response) {
  const result = await AuthService.register(req.body, {
    ip: req.ip,
    userAgent: req.get("user-agent") || undefined,
  });
  const { refreshToken, ...responsePayload } = result;

  // Refresh token is stored in an HttpOnly cookie — never exposed in the JSON body
  setRefreshTokenCookie(res, refreshToken);

  res.status(201).json(responsePayload);
}

/**
 * Login user
 * @route POST /api/v1/auth/login
 * @access Public
 * @security TODO: Add rate limiting (max 10 login attempts per IP per hour)
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
 * Logout user
 * @route POST /api/v1/auth/logout
 * @access Private (requires valid refresh token in cookie)
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
 * Refresh access token using Refresh Token Rotation.
 * The old refresh token is consumed and a new one is issued on every call.
 * @route POST /api/v1/auth/refresh
 * @access Public (requires valid refresh token in cookie)
 */
export async function refreshToken(req: Request, res: Response) {
  const currentRefreshToken = extractRefreshToken(req);

  const result = await AuthService.refreshToken(currentRefreshToken, {
    ip: req.ip,
    userAgent: req.get("user-agent") || undefined,
  });
  const { refreshToken: rotatedRefreshToken, ...responsePayload } = result;

  // Replace the old refresh token cookie with the newly rotated one
  setRefreshTokenCookie(res, rotatedRefreshToken);

  res.json(responsePayload);
}

// TODO: Add controller for password reset
// export async function requestPasswordReset(req: Request, res: Response)
// export async function resetPassword(req: Request, res: Response)

// TODO: Add controller for email verification (optional)
// export async function verifyEmail(req: Request, res: Response)

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
