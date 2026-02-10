import { Router, type IRouter } from "express";
import { authenticate } from "../../shared/middlewares/auth.js";
import { validate } from "../../shared/middlewares/validate.js";
import { asyncHandler } from "../../shared/utils/async.handler.js";
import * as paymentController from "./payment.controller.js";
import { createPaymentSchema } from "./payment.validators.js";

export const paymentRouter: IRouter = Router();

// All routes require authentication
paymentRouter.use(authenticate);

paymentRouter.post(
  "/",
  validate(createPaymentSchema),
  asyncHandler(paymentController.createPayment),
);

paymentRouter.get("/:id", asyncHandler(paymentController.getPaymentById));

paymentRouter.post(
  "/:id/process",
  asyncHandler(paymentController.processPayment),
);

paymentRouter.post(
  "/:id/refund",
  asyncHandler(paymentController.refundPayment),
);

// Webhook endpoint (no auth needed, verify signature instead)
// paymentRouter.post("/webhook", asyncHandler(paymentController.handleWebhook));
