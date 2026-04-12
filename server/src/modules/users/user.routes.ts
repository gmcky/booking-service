import { Router, type IRouter } from "express";
import multer from "multer";
import { authenticate, authorize } from "../../shared/middlewares/auth.js";
import { AppError } from "../../shared/middlewares/error.handler.js";
import { validate } from "../../shared/middlewares/validate.js";
import { asyncHandler } from "../../shared/utils/async.handler.js";
import {
  getCurrentUser,
  getCurrentUserStats,
  updateCurrentUser,
  deleteAvatar,
  deleteCurrentUser,
  changePassword,
  requestEmailChange,
  confirmEmailChange,
  getAllUsers,
  getUserById,
  suspendUser,
  restoreUser,
} from "./user.controller.js";
import {
  updateUserSchema,
  deleteCurrentUserSchema,
  changePasswordSchema,
  getUsersQuerySchema,
  requestEmailChangeSchema,
  confirmEmailChangeSchema,
} from "./user.validators.js";

export const userRouter: IRouter = Router();

const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 2 * 1024 * 1024,
    files: 1,
  },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) {
      cb(new AppError(400, "Only image files are allowed"));
      return;
    }

    cb(null, true);
  },
});

// ─── Current user profile ──────────────────────────────────────────────────────
userRouter.get("/me", authenticate, asyncHandler(getCurrentUser));
userRouter.get("/me/stats", authenticate, asyncHandler(getCurrentUserStats));

userRouter.patch(
  "/me",
  authenticate,
  avatarUpload.single("avatar"),
  validate(updateUserSchema),
  asyncHandler(updateCurrentUser),
);

userRouter.delete("/me/avatar", authenticate, asyncHandler(deleteAvatar));

userRouter.delete(
  "/me",
  authenticate,
  validate(deleteCurrentUserSchema),
  asyncHandler(deleteCurrentUser),
);

userRouter.post(
  "/me/change-password",
  authenticate,
  validate(changePasswordSchema),
  asyncHandler(changePassword),
);

// ─── Secure email change (two-step OTP flow) ───────────────────────────────────
/**
 * Step 1 — Send OTP to the new email address.
 * POST /api/v1/users/me/email/request-change
 * Body: { newEmail: string }
 */
userRouter.post(
  "/me/email/request-change",
  authenticate,
  validate(requestEmailChangeSchema),
  asyncHandler(requestEmailChange),
);

/**
 * Step 2 — Confirm the change with the OTP.
 * POST /api/v1/users/me/email/confirm-change
 * Body: { otp: string }
 */
userRouter.post(
  "/me/email/confirm-change",
  authenticate,
  validate(confirmEmailChangeSchema),
  asyncHandler(confirmEmailChange),
);

// ─── Admin only ────────────────────────────────────────────────────────────────
userRouter.get(
  "/",
  authenticate,
  authorize("ADMIN"),
  validate(getUsersQuerySchema, "query"),
  asyncHandler(getAllUsers),
);

userRouter.patch(
  "/:id/suspend",
  authenticate,
  authorize("ADMIN"),
  asyncHandler(suspendUser),
);

userRouter.patch(
  "/:id/restore",
  authenticate,
  authorize("ADMIN"),
  asyncHandler(restoreUser),
);

// ─── Public profile ───────────────────────────────────────────────────────────
userRouter.get("/:id", asyncHandler(getUserById));
