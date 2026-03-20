import express, { Router, type IRouter } from "express";
import { authenticate, authorize } from "../../shared/middlewares/auth.js";
import { validate } from "../../shared/middlewares/validate.js";
import { asyncHandler } from "../../shared/utils/async.handler.js";
import * as paymentController from "./payment.controller.js";
import {
  createPaymentIntentSchema,
  createPaymentSchema,
} from "./payment.validators.js";

export const paymentRouter: IRouter = Router();

// Webhook route must run before authenticated JSON routes because Stripe
// signature verification requires the raw request body.
paymentRouter.post(
  "/webhook",
  express.raw({ type: "application/json" }),
  asyncHandler(paymentController.handleWebhook),
);

// Routes below require authentication.
paymentRouter.use(authenticate);

paymentRouter.post(
  "/",
  validate(createPaymentSchema),
  asyncHandler(paymentController.createPayment),
);

paymentRouter.post(
  "/intent",
  validate(createPaymentIntentSchema),
  asyncHandler(paymentController.createPaymentIntent),
);

paymentRouter.get("/:id", asyncHandler(paymentController.getPaymentById));

paymentRouter.post(
  "/:id/process",
  asyncHandler(paymentController.processPayment),
);

paymentRouter.post(
  "/:id/refund",
  asyncHandler(paymentController.requestRefund),
);

paymentRouter.post(
  "/:id/refund/approve",
  authorize("ADMIN"),
  asyncHandler(paymentController.approveRefund),
);

paymentRouter.post(
  "/:id/refund/reject",
  authorize("ADMIN"),
  asyncHandler(paymentController.rejectRefund),
);
