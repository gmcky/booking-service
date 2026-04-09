import express, { Router, type IRouter } from "express";
import { authenticate, authorize } from "../../shared/middlewares/auth.js";
import { validate } from "../../shared/middlewares/validate.js";
import { asyncHandler } from "../../shared/utils/async.handler.js";
import * as paymentController from "./payment.controller.js";
import {
  createPaymentIntentSchema,
  createPaymentSchema,
  requestRefundSchema,
  rejectRefundSchema,
} from "./payment.validators.js";

export const paymentRouter: IRouter = Router();

// Must be first: Stripe signature check requires raw body, before JSON/auth middleware.
paymentRouter.post(
  "/webhook",
  express.raw({ type: "application/json" }),
  asyncHandler(paymentController.handleWebhook),
);
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

paymentRouter.post(
  "/payout-lifecycle/run-now",
  authorize("ADMIN"),
  asyncHandler(paymentController.runPayoutLifecycleNow),
);

paymentRouter.get("/:id", asyncHandler(paymentController.getPaymentById));

// Manual override endpoint: ADMIN-only because it bypasses provider-state checks.
paymentRouter.post(
  "/:id/process",
  authorize("ADMIN"),
  asyncHandler(paymentController.processPayment),
);

paymentRouter.post(
  "/:id/refund",
  validate(requestRefundSchema),
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
  validate(rejectRefundSchema),
  asyncHandler(paymentController.rejectRefund),
);
