import { Router, type IRouter } from "express";
import { authenticate, authorize } from "../../shared/middlewares/auth.js";
import { validate } from "../../shared/middlewares/validate.js";
import { asyncHandler } from "../../shared/utils/async.handler.js";
import * as userController from "./user.controller.js";
import {
  updateUserSchema,
  requestEmailChangeSchema,
  confirmEmailChangeSchema,
} from "./user.validators.js";

export const userRouter: IRouter = Router();

// All routes require authentication
userRouter.use(authenticate);

// ─── Current user profile ──────────────────────────────────────────────────────
userRouter.get("/me", asyncHandler(userController.getCurrentUser));

userRouter.patch(
  "/me",
  validate(updateUserSchema),
  asyncHandler(userController.updateCurrentUser),
);

userRouter.delete("/me", asyncHandler(userController.deleteCurrentUser));

// ─── Secure email change (two-step OTP flow) ───────────────────────────────────
/**
 * Step 1 — Send OTP to the new email address.
 * POST /api/v1/users/me/email/request-change
 * Body: { newEmail: string }
 */
userRouter.post(
  "/me/email/request-change",
  validate(requestEmailChangeSchema),
  asyncHandler(userController.requestEmailChange),
);

/**
 * Step 2 — Confirm the change with the OTP.
 * POST /api/v1/users/me/email/confirm-change
 * Body: { otp: string }
 */
userRouter.post(
  "/me/email/confirm-change",
  validate(confirmEmailChangeSchema),
  asyncHandler(userController.confirmEmailChange),
);

// ─── Admin only ────────────────────────────────────────────────────────────────
userRouter.get(
  "/",
  authorize("ADMIN"),
  asyncHandler(userController.getAllUsers),
);

userRouter.get(
  "/:id",
  authorize("ADMIN"),
  asyncHandler(userController.getUserById),
);
