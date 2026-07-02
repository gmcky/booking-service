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

/**
 * @openapi
 * /payments/webhook:
 *   post:
 *     tags: [Payments]
 *     summary: Stripe webhook receiver (raw body, signature verified)
 *     description: Mounted before JSON/auth middleware. Not for direct client use.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { type: object }
 *     responses:
 *       200: { description: Event processed (idempotent) }
 *       400: { description: Invalid signature or payload }
 */
// Must be first: Stripe signature check requires raw body, before JSON/auth middleware.
paymentRouter.post(
  "/webhook",
  express.raw({ type: "application/json" }),
  asyncHandler(paymentController.handleWebhook),
);
paymentRouter.use(authenticate);

/**
 * @openapi
 * /payments:
 *   post:
 *     tags: [Payments]
 *     summary: Create payment record for a booking
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [bookingId, provider]
 *             properties:
 *               bookingId: { type: string, format: uuid }
 *               provider: { type: string, enum: [STRIPE] }
 *               currency: { type: string, default: USD, minLength: 3, maxLength: 3 }
 *     responses:
 *       201:
 *         description: Payment created
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Payment'
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
paymentRouter.post(
  "/",
  validate(createPaymentSchema),
  asyncHandler(paymentController.createPayment),
);

/**
 * @openapi
 * /payments/intent:
 *   post:
 *     tags: [Payments]
 *     summary: Create Stripe PaymentIntent for booking, returns client secret
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [bookingId]
 *             properties:
 *               bookingId: { type: string, format: uuid }
 *     responses:
 *       201:
 *         description: PaymentIntent client secret
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 clientSecret: { type: string }
 *               required: [clientSecret]
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
paymentRouter.post(
  "/intent",
  validate(createPaymentIntentSchema),
  asyncHandler(paymentController.createPaymentIntent),
);

/**
 * @openapi
 * /payments/payout-lifecycle/run-now:
 *   post:
 *     tags: [Payments]
 *     summary: Trigger payout lifecycle job immediately (ADMIN only)
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       202: { description: Job enqueued }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
paymentRouter.post(
  "/payout-lifecycle/run-now",
  authorize("ADMIN"),
  asyncHandler(paymentController.runPayoutLifecycleNow),
);

/**
 * @openapi
 * /payments/{id}:
 *   get:
 *     tags: [Payments]
 *     summary: Get payment by id
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200:
 *         description: Payment detail
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/Payment'
 *                 - type: object
 *                   properties:
 *                     booking:
 *                       allOf:
 *                         - $ref: '#/components/schemas/Booking'
 *                         - type: object
 *                           properties:
 *                             property:
 *                               $ref: '#/components/schemas/Property'
 *                           required: [property]
 *                   required: [booking]
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
paymentRouter.get("/:id", asyncHandler(paymentController.getPaymentById));

/**
 * @openapi
 * /payments/{id}/process:
 *   post:
 *     tags: [Payments]
 *     summary: Manual processing override (ADMIN, bypasses provider state check)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200:
 *         description: Payment marked processed
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Payment'
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
// Manual override endpoint: ADMIN-only because it bypasses provider-state checks.
paymentRouter.post(
  "/:id/process",
  authorize("ADMIN"),
  asyncHandler(paymentController.processPayment),
);

/**
 * @openapi
 * /payments/{id}/refund:
 *   post:
 *     tags: [Payments]
 *     summary: Request refund for a payment (guest)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               reason: { type: string, maxLength: 1000 }
 *     responses:
 *       200:
 *         description: Refund requested
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Payment'
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
paymentRouter.post(
  "/:id/refund",
  validate(requestRefundSchema),
  asyncHandler(paymentController.requestRefund),
);

/**
 * @openapi
 * /payments/{id}/refund/approve:
 *   post:
 *     tags: [Payments]
 *     summary: Approve refund request (ADMIN only)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200:
 *         description: Refund approved and issued
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Payment'
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
paymentRouter.post(
  "/:id/refund/approve",
  authorize("ADMIN"),
  asyncHandler(paymentController.approveRefund),
);

/**
 * @openapi
 * /payments/{id}/refund/reject:
 *   post:
 *     tags: [Payments]
 *     summary: Reject refund request (ADMIN only)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               reason: { type: string, maxLength: 1000 }
 *     responses:
 *       200:
 *         description: Refund rejected
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Payment'
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
paymentRouter.post(
  "/:id/refund/reject",
  authorize("ADMIN"),
  validate(rejectRefundSchema),
  asyncHandler(paymentController.rejectRefund),
);
