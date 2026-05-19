import { Router, type IRouter } from "express";
import { validate } from "../../shared/middlewares/validate.js";
import { asyncHandler } from "../../shared/utils/async.handler.js";
import * as authController from "./auth.controller.js";
import { loginSchema, registerSchema } from "./auth.validators.js";

export const authRouter: IRouter = Router();

/**
 * @openapi
 * /auth/register:
 *   post:
 *     tags: [Auth]
 *     summary: Register a new user
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password, firstName, lastName, phoneNumber]
 *             properties:
 *               email: { type: string, format: email }
 *               password: { type: string, minLength: 8 }
 *               firstName: { type: string }
 *               lastName: { type: string }
 *               phoneNumber: { type: string }
 *     responses:
 *       201:
 *         description: User registered successfully
 *       400:
 *         description: Validation error
 */
authRouter.post(
  "/register",
  validate(registerSchema),
  asyncHandler(authController.register),
);

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
 *     responses:
 *       200:
 *         description: Login successful
 *       401:
 *         description: Invalid credentials
 */
authRouter.post(
  "/login",
  validate(loginSchema),
  asyncHandler(authController.login),
);

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
 *       401:
 *         description: Refresh token missing or invalid
 */
authRouter.post("/refresh", asyncHandler(authController.refreshToken));
