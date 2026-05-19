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

/**
 * @openapi
 * /users/me:
 *   get:
 *     tags: [Users]
 *     summary: Get current authenticated user
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Current user profile }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
userRouter.get("/me", authenticate, asyncHandler(getCurrentUser));

/**
 * @openapi
 * /users/me/stats:
 *   get:
 *     tags: [Users]
 *     summary: Get aggregated stats for current user
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: User stats (bookings, properties, reviews counts) }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
userRouter.get("/me/stats", authenticate, asyncHandler(getCurrentUserStats));

/**
 * @openapi
 * /users/me:
 *   patch:
 *     tags: [Users]
 *     summary: Update current user profile (multipart, optional avatar)
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               firstName: { type: string }
 *               lastName: { type: string }
 *               phoneNumber: { type: string }
 *               dateOfBirth: { type: string, format: date }
 *               bio: { type: string, maxLength: 500 }
 *               avatar: { type: string, format: binary }
 *     responses:
 *       200: { description: Profile updated }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
userRouter.patch(
  "/me",
  authenticate,
  avatarUpload.single("avatar"),
  validate(updateUserSchema),
  asyncHandler(updateCurrentUser),
);

/**
 * @openapi
 * /users/me/avatar:
 *   delete:
 *     tags: [Users]
 *     summary: Remove current user avatar
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       204: { description: Avatar removed }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
userRouter.delete("/me/avatar", authenticate, asyncHandler(deleteAvatar));

/**
 * @openapi
 * /users/me:
 *   delete:
 *     tags: [Users]
 *     summary: Soft-delete current user (requires password)
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [password]
 *             properties:
 *               password: { type: string }
 *     responses:
 *       204: { description: Account deleted }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
userRouter.delete(
  "/me",
  authenticate,
  validate(deleteCurrentUserSchema),
  asyncHandler(deleteCurrentUser),
);

/**
 * @openapi
 * /users/me/change-password:
 *   post:
 *     tags: [Users]
 *     summary: Change current user password
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [currentPassword, newPassword, confirmPassword]
 *             properties:
 *               currentPassword: { type: string }
 *               newPassword: { type: string, minLength: 12 }
 *               confirmPassword: { type: string }
 *     responses:
 *       204: { description: Password changed }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
userRouter.post(
  "/me/change-password",
  authenticate,
  validate(changePasswordSchema),
  asyncHandler(changePassword),
);

/**
 * @openapi
 * /users/me/email/request-change:
 *   post:
 *     tags: [Users]
 *     summary: Step 1 — send OTP to new email
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [newEmail]
 *             properties:
 *               newEmail: { type: string, format: email }
 *     responses:
 *       202: { description: OTP queued to new email }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
userRouter.post(
  "/me/email/request-change",
  authenticate,
  validate(requestEmailChangeSchema),
  asyncHandler(requestEmailChange),
);

/**
 * @openapi
 * /users/me/email/confirm-change:
 *   post:
 *     tags: [Users]
 *     summary: Step 2 — confirm new email with 6-digit OTP
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [otp]
 *             properties:
 *               otp: { type: string, pattern: '^\d{6}$' }
 *     responses:
 *       200: { description: Email updated }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
userRouter.post(
  "/me/email/confirm-change",
  authenticate,
  validate(confirmEmailChangeSchema),
  asyncHandler(confirmEmailChange),
);

/**
 * @openapi
 * /users:
 *   get:
 *     tags: [Users]
 *     summary: List users (ADMIN only)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: query, name: page, schema: { type: integer, default: 1 } }
 *       - { in: query, name: limit, schema: { type: integer, default: 10, maximum: 100 } }
 *       - { in: query, name: role, schema: { type: string, enum: [USER, ADMIN] } }
 *       - { in: query, name: dateFrom, schema: { type: string, format: date-time } }
 *       - { in: query, name: dateTo, schema: { type: string, format: date-time } }
 *       - { in: query, name: search, schema: { type: string } }
 *       - { in: query, name: isDeleted, schema: { type: boolean } }
 *     responses:
 *       200: { description: Paginated user list }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
userRouter.get(
  "/",
  authenticate,
  authorize("ADMIN"),
  validate(getUsersQuerySchema, "query"),
  asyncHandler(getAllUsers),
);

/**
 * @openapi
 * /users/{id}/suspend:
 *   patch:
 *     tags: [Users]
 *     summary: Suspend user account (ADMIN only)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200: { description: User suspended }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
userRouter.patch("/:id/suspend", authenticate, authorize("ADMIN"), asyncHandler(suspendUser));

/**
 * @openapi
 * /users/{id}/restore:
 *   patch:
 *     tags: [Users]
 *     summary: Restore suspended user (ADMIN only)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200: { description: User restored }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
userRouter.patch("/:id/restore", authenticate, authorize("ADMIN"), asyncHandler(restoreUser));

/**
 * @openapi
 * /users/{id}:
 *   get:
 *     tags: [Users]
 *     summary: Get public user profile by id
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200: { description: Public user profile }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
userRouter.get("/:id", asyncHandler(getUserById));
