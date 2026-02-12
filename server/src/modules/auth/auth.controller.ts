import type { Request, Response, CookieOptions } from "express";
import { AuthService } from "./auth.service.js";
import { env } from "../../config/env.js";
import { AppError } from "../../shared/middlewares/error.handler.js";

const REFRESH_TOKEN_COOKIE_NAME = "refreshToken";
const REFRESH_TOKEN_COOKIE_OPTIONS: CookieOptions = {
  httpOnly: true,
  secure: env.NODE_ENV === "production",
  sameSite: env.NODE_ENV === "production" ? "strict" : "lax",
  path: `/api/${env.API_VERSION}/auth`,
  maxAge: parseExpiryToMs(env.JWT_REFRESH_EXPIRES_IN),
};

/**
 * Register a new user
 * @route POST /api/v1/auth/register
 * @access Public
 */
export async function register(req: Request, res: Response) {
  // TODO: Validate request body using Zod (already done in middleware)
  // Body: { email, password, firstName, lastName }

  const result = await AuthService.register(req.body, {
    ip: req.ip,
    userAgent: req.get("user-agent") || undefined,
  });
  const { refreshToken, ...responsePayload } = result;

  setRefreshTokenCookie(res, refreshToken);

  // TODO: Set refresh token as HttpOnly cookie (CRITICAL for security)
  // NEVER send refresh token in JSON response (vulnerable to XSS)
  // res.cookie('refreshToken', result.refreshToken, {
  //   httpOnly: true,        // Cannot be accessed via JavaScript
  //   secure: env.NODE_ENV === 'production', // HTTPS only in production
  //   sameSite: 'strict',    // CSRF protection
  //   maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  //   path: '/api/v1/auth'   // Only sent to auth endpoints
  // });

  // TODO: Return user data and access token (NOT refresh token)
  // return { user, accessToken }
  res.status(201).json(responsePayload);

  // TODO: Add rate limiting middleware (max 5 registrations per IP per hour)
}

/**
 * Login user
 * @route POST /api/v1/auth/login
 * @access Public
 */
export async function login(req: Request, res: Response) {
  // TODO: Validate credentials using Zod
  // Body: { email, password }

  const result = await AuthService.login(req.body, {
    ip: req.ip,
    userAgent: req.get("user-agent") || undefined,
  });
  const { refreshToken, ...responsePayload } = result;

  setRefreshTokenCookie(res, refreshToken);

  // TODO: Set refresh token as HttpOnly cookie
  // Same configuration as register

  // TODO: Return user data + access token only
  res.json(responsePayload);

  // TODO: Add rate limiting (max 10 login attempts per IP per hour)
  // TODO: Log login attempts (successful and failed)
}

/**
 * Logout user
 * @route POST /api/v1/auth/logout
 * @access Private (requires valid refresh token)
 */
export async function logout(req: Request, res: Response) {
  // TODO: Get refresh token from HttpOnly cookie (NOT body)
  // const refreshToken = req.cookies.refreshToken;
  // if (!refreshToken) throw new AppError(401, 'No refresh token provided');

  const refreshToken = extractRefreshToken(req);

  await AuthService.logout(refreshToken, {
    ip: req.ip,
    userAgent: req.get("user-agent") || undefined,
  });

  // TODO: Clear the refresh token cookie
  // res.clearCookie('refreshToken', { path: '/api/v1/auth' });
  clearRefreshTokenCookie(res);

  res.status(204).send();
}

/**
 * Refresh access token
 * @route POST /api/v1/auth/refresh
 * @access Public (requires valid refresh token in cookie)
 */
export async function refreshToken(req: Request, res: Response) {
  // TODO: Get refresh token from HttpOnly cookie
  // const refreshToken = req.cookies.refreshToken;
  // if (!refreshToken) throw new AppError(401, 'No refresh token');

  const currentRefreshToken = extractRefreshToken(req);

  const result = await AuthService.refreshToken(currentRefreshToken);
  const { refreshToken: rotatedRefreshToken, ...responsePayload } = result;

  setRefreshTokenCookie(res, rotatedRefreshToken);

  // TODO: If using Refresh Token Rotation, set new refresh token cookie
  // if (result.refreshToken) {
  //   res.cookie('refreshToken', result.refreshToken, { ... });
  // }

  // TODO: Return new access token
  res.json(responsePayload);

  // TODO: This endpoint should NOT be rate-limited (users need continuous access)
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

function parseExpiryToMs(expiry: string): number {
  const units: Record<string, number> = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
  };

  const match = expiry.match(/^(\d+)([smhd])$/);
  if (!match || !match[1] || !match[2]) {
    throw new Error(`Invalid expiry format: ${expiry}`);
  }

  const value = parseInt(match[1], 10);
  const unit = match[2];
  const multiplier = units[unit];

  if (!multiplier) {
    throw new Error(`Invalid time unit: ${unit}`);
  }

  return value * multiplier;
}
