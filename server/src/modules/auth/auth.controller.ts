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
 * Register a new user.
 * @route POST /api/v1/auth/register
 * @access Public
 * @security TODO: Add registration rate limiting per IP.
 */
export async function register(req: Request, res: Response) {
  const result = await AuthService.register(req.body, {
    ip: req.ip,
    userAgent: req.get("user-agent") || undefined,
  });
  const { refreshToken, ...responsePayload } = result;

  // Store refresh token in an HttpOnly cookie and exclude it from JSON responses.
  setRefreshTokenCookie(res, refreshToken);

  res.status(201).json(responsePayload);
}

/**
 * Authenticate a user.
 * @route POST /api/v1/auth/login
 * @access Public
 * @security TODO: Add login attempt rate limiting per IP.
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
 * Log out a user.
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
 * The current refresh token is consumed and rotated on each call.
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

  // Replace the previous refresh token cookie with the rotated token.
  setRefreshTokenCookie(res, rotatedRefreshToken);

  res.json(responsePayload);
}

// TODO: Add password reset endpoints.
// TODO: Add email verification endpoint.

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
