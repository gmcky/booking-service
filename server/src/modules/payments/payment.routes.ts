import express, { Router, type IRouter } from "express";
import { authenticate } from "../../shared/middlewares/auth.js";
import { validate } from "../../shared/middlewares/validate.js";
import { asyncHandler } from "../../shared/utils/async.handler.js";
import * as paymentController from "./payment.controller.js";
import { createPaymentSchema } from "./payment.validators.js";

export const paymentRouter: IRouter = Router();

// ─── Webhook (raw body, no JWT auth) ─────────────────────────────────────────
// IMPORTANT: must be defined BEFORE the json-body authenticate middleware,
// because Stripe signature verification requires the raw Buffer, not parsed JSON.
paymentRouter.post(
  "/webhook",
  express.raw({ type: "application/json" }), // keeps body as Buffer
  asyncHandler(paymentController.handleWebhook),
);

// ─── All routes below require authentication ──────────────────────────────────
paymentRouter.use(authenticate);

// Create payment record (legacy simple flow)
paymentRouter.post(
  "/",
  validate(createPaymentSchema),
  asyncHandler(paymentController.createPayment),
);

// Create Stripe PaymentIntent → returns client_secret to frontend
paymentRouter.post(
  "/intent",
  asyncHandler(paymentController.createPaymentIntent),
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
