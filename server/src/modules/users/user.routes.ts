import { Router, type IRouter } from "express";
import { authenticate, authorize } from "../../shared/middlewares/auth.js";
import { validate } from "../../shared/middlewares/validate.js";
import { asyncHandler } from "../../shared/utils/async.handler.js";
import * as userController from "./user.controller.js";
import { updateUserSchema } from "./user.validators.js";

export const userRouter: IRouter = Router();

// Protected routes
userRouter.use(authenticate);

userRouter.get("/me", asyncHandler(userController.getCurrentUser));

userRouter.patch(
  "/me",
  validate(updateUserSchema),
  asyncHandler(userController.updateCurrentUser),
);

userRouter.delete("/me", asyncHandler(userController.deleteCurrentUser));

// Admin only
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
