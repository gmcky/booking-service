import { Router, type IRouter } from "express";
import { authenticate } from "../../shared/middlewares/auth.js";
import { validate } from "../../shared/middlewares/validate.js";
import { asyncHandler } from "../../shared/utils/async.handler.js";
import * as authController from "./auth.controller.js";
import {
  loginSchema,
  registerSchema,
  verifyEmailSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from "./auth.validators.js";

export const authRouter: IRouter = Router();

/**
 * @openapi
 * /auth/register:
 *   post:
 *     tags: [Auth]
 *     summary: Register a new user
 *     description: |
 *       Creates a new account. Passwords are scored with zxcvbn; anything
 *       below score 3 (common, short, predictable) is rejected even if it
 *       meets the 8-character minimum. `phoneNumber` is optional, but when
 *       supplied it must be a valid international number parseable by
 *       libphonenumber-js — typically E.164 with a leading `+` and country
 *       code. Reserved test ranges (e.g. US `555-01xx`) are rejected.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password, firstName, lastName]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 description: Lowercased and trimmed server-side.
 *                 example: jane.doe@example.com
 *               password:
 *                 type: string
 *                 minLength: 8
 *                 maxLength: 128
 *                 description: Must pass zxcvbn strength check (score ≥ 3). Avoid common words, keyboard patterns, and personal info.
 *                 example: Tr0ub4dor&3-Purge!
 *               firstName:
 *                 type: string
 *                 minLength: 1
 *                 example: Jane
 *               lastName:
 *                 type: string
 *                 minLength: 1
 *                 example: Doe
 *               phoneNumber:
 *                 type: string
 *                 minLength: 10
 *                 maxLength: 20
 *                 description: Optional. International format (E.164 recommended). Validated with libphonenumber-js.
 *                 example: "+14155552671"
 *     responses:
 *       201:
 *         description: User registered successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthResponse'
 *       400:
 *         description: Validation error (weak password, invalid phone, malformed email, etc.)
 *       409:
 *         description: Registration conflict (typically email already in use; deliberately generic to avoid account enumeration)
 *       429:
 *         description: Too many registration attempts (rate limited)
 */
authRouter.post("/register", validate(registerSchema), asyncHandler(authController.register));

/**
 * @openapi
 * /auth/login:
 *   post:
 *     tags: [Auth]
 *     summary: Login and receive JWT tokens
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email: { type: string, format: email }
 *               password: { type: string }
 *             example:
 *               email: demo@booking.dev
 *               password: demo1234
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthResponse'
 *       401:
 *         description: Invalid credentials
 */
authRouter.post("/login", validate(loginSchema), asyncHandler(authController.login));

/**
 * @openapi
 * /auth/logout:
 *   post:
 *     tags: [Auth]
 *     summary: Logout and invalidate refresh token
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       204:
 *         description: Logout successful
 */
authRouter.post("/logout", asyncHandler(authController.logout));

/**
 * @openapi
 * /auth/refresh:
 *   post:
 *     tags: [Auth]
 *     summary: Refresh access token using HttpOnly cookie
 *     responses:
 *       200:
 *         description: Token refreshed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 accessToken: { type: string }
 *               required: [accessToken]
 *       401:
 *         description: Refresh token missing or invalid
 */
authRouter.post("/refresh", asyncHandler(authController.refreshToken));

/**
 * @openapi
 * /auth/verify-email:
 *   post:
 *     tags: [Auth]
 *     summary: Verify email address via link token
 *     description: |
 *       Consumes the link token emailed to the user on registration
 *       (`{token}` query param appended to `CLIENT_URL/verify-email`).
 *       The token is single-use and expires 24 hours after issuance.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token]
 *             properties:
 *               token: { type: string }
 *     responses:
 *       204:
 *         description: Email verified
 *       400:
 *         description: Token is invalid, expired, or already used
 */
authRouter.post(
  "/verify-email",
  validate(verifyEmailSchema),
  asyncHandler(authController.verifyEmail),
);

/**
 * @openapi
 * /auth/resend-verification:
 *   post:
 *     tags: [Auth]
 *     summary: Resend the email verification link
 *     description: |
 *       Rotates and re-sends the verification token. Rate-limited to 3
 *       requests per hour per user. A no-op (still 204, no email sent) if
 *       the account is already verified.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       204:
 *         description: Verification email re-sent (or account already verified)
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       429:
 *         description: Too many resend requests this hour
 */
authRouter.post(
  "/resend-verification",
  authenticate,
  asyncHandler(authController.resendVerification),
);

/**
 * @openapi
 * /auth/forgot-password:
 *   post:
 *     tags: [Auth]
 *     summary: Request a password reset link
 *     description: |
 *       Always responds 204, whether or not the email belongs to an
 *       account — this endpoint never discloses account existence.
 *       Rate-limited to 3 requests per hour per email; requests beyond
 *       that limit are silently dropped (still 204, no email sent).
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email: { type: string, format: email }
 *     responses:
 *       204:
 *         description: Request accepted (email sent if the account exists and is under the rate limit)
 *       400:
 *         description: Validation error (malformed email)
 */
authRouter.post(
  "/forgot-password",
  validate(forgotPasswordSchema),
  asyncHandler(authController.forgotPassword),
);

/**
 * @openapi
 * /auth/reset-password:
 *   post:
 *     tags: [Auth]
 *     summary: Reset password via link token
 *     description: |
 *       Consumes the link token emailed by `/auth/forgot-password`
 *       (`{token}` query param appended to `CLIENT_URL/reset-password`).
 *       The token is single-use and expires 1 hour after issuance. On
 *       success, every refresh token for the account is revoked (all
 *       sessions are logged out) and, if the email had not been verified
 *       yet, it is marked verified — a successful reset proves mailbox
 *       ownership.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token, newPassword]
 *             properties:
 *               token: { type: string }
 *               newPassword:
 *                 type: string
 *                 minLength: 8
 *                 maxLength: 128
 *                 description: Must pass zxcvbn strength check (score ≥ 3), same rule as registration.
 *     responses:
 *       204:
 *         description: Password reset; all sessions revoked
 *       400:
 *         description: Token is invalid, expired, already used, or the new password is too weak (deliberately generic for the token failure modes to avoid leaking which one occurred)
 */
authRouter.post(
  "/reset-password",
  validate(resetPasswordSchema),
  asyncHandler(authController.resetPassword),
);
