import type { Request, Response } from "express";
import { AuthService } from "./auth.service.js";

/**
 * Register a new user
 * @route POST /api/v1/auth/register
 * @access Public
 */
export async function register(req: Request, res: Response) {
  // TODO: Validate request body using Zod (already done in middleware)
  // Body: { email, password, firstName, lastName }

  const result = await AuthService.register(req.body);

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
  res.status(201).json(result);

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

  const result = await AuthService.login(req.body);

  // TODO: Set refresh token as HttpOnly cookie
  // Same configuration as register

  // TODO: Return user data + access token only
  res.json(result);

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

  const { refreshToken } = req.body; // TEMPORARY - change to cookie

  await AuthService.logout(refreshToken);

  // TODO: Clear the refresh token cookie
  // res.clearCookie('refreshToken', { path: '/api/v1/auth' });

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

  const { refreshToken } = req.body; // TEMPORARY - change to cookie

  const result = await AuthService.refreshToken(refreshToken);

  // TODO: If using Refresh Token Rotation, set new refresh token cookie
  // if (result.refreshToken) {
  //   res.cookie('refreshToken', result.refreshToken, { ... });
  // }

  // TODO: Return new access token
  res.json(result);

  // TODO: This endpoint should NOT be rate-limited (users need continuous access)
}

// TODO: Add controller for password reset
// export async function requestPasswordReset(req: Request, res: Response)
// export async function resetPassword(req: Request, res: Response)

// TODO: Add controller for email verification (optional)
// export async function verifyEmail(req: Request, res: Response)
