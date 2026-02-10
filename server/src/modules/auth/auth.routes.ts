import { Router, type IRouter } from "express";
import { validate } from "../../shared/middlewares/validate.js";
import { asyncHandler } from "../../shared/utils/async.handler.js";
import * as authController from "./auth.controller.js";
import { loginSchema, registerSchema } from "./auth.validators.js";

export const authRouter: IRouter = Router();

authRouter.post(
  "/register",
  validate(registerSchema),
  asyncHandler(authController.register),
);

authRouter.post(
  "/login",
  validate(loginSchema),
  asyncHandler(authController.login),
);

authRouter.post("/logout", asyncHandler(authController.logout));

authRouter.post("/refresh", asyncHandler(authController.refreshToken));
