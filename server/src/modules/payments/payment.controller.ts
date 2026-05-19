import express, { type Response } from "express";
import type { AuthenticatedRequest } from "../../shared/types/index.js";
import { getIdParam } from "../../shared/utils/request.helpers.js";
import { PaymentService } from "./payment.service.js";
import type { RequestRefundInput, RejectRefundInput } from "./payment.types.js";

/**
 * @server\src\api.routes.ts
 * @route POST /api/v1/payments
 * @access Private
 * @security Bearer token required.
 * @body { bookingId, currency? }
 */
export async function createPayment(req: AuthenticatedRequest, res: Response) {
  const userId = req.user!.id;
  const payment = await PaymentService.create(req.body, userId);
  res.status(201).json(payment);
}

/**
 * @server\src\api.routes.ts
 * @route GET /api/v1/payments/:id
 * @access Private
 * @security Bearer token required.
 */
export async function getPaymentById(req: AuthenticatedRequest, res: Response) {
  const id = getIdParam(req);
  const userId = req.user!.id;
  const payment = await PaymentService.getById(id, userId);
  res.json(payment);
}

/**
 * @server\src\api.routes.ts
 * @route POST /api/v1/payments/:id/process
 * @access Private (admin)
 * @security Bearer token required + ADMIN role.
 * @deprecated Use webhook for production
 */
export async function processPayment(req: AuthenticatedRequest, res: Response) {
  const id = getIdParam(req);
  const requesterId = req.user!.id;
  const requesterRole = req.user!.role;
  const payment = await PaymentService.process(id, requesterId, requesterRole);
  res.json(payment);
}

/**
 * @server\src\api.routes.ts
 * @route POST /api/v1/payments/:id/refund
 * @access Private
 * @security Bearer token required.
 */
export async function requestRefund(req: AuthenticatedRequest, res: Response) {
  const id = getIdParam(req);
  const userId = req.user!.id;
  const { reason } = req.body as RequestRefundInput;
  const payment = await PaymentService.requestRefund(id, userId, reason);
  res.json(payment);
}

/**
 * @server\src\api.routes.ts
 * @route POST /api/v1/payments/:id/refund/approve
 * @access Private
 * @security Bearer token required + ADMIN role.
 */
export async function approveRefund(req: AuthenticatedRequest, res: Response) {
  const id = getIdParam(req);
  const adminId = req.user!.id;
  const payment = await PaymentService.approveRefund(id, adminId);
  res.json(payment);
}

/**
 * @server\src\api.routes.ts
 * @route POST /api/v1/payments/:id/refund/reject
 * @access Private
 * @security Bearer token required + ADMIN role.
 */
export async function rejectRefund(req: AuthenticatedRequest, res: Response) {
  const id = getIdParam(req);
  const adminId = req.user!.id;
  const { reason } = req.body as RejectRefundInput;
  const payment = await PaymentService.rejectRefund(id, adminId, reason);
  res.json(payment);
}

/**
 * @server\src\api.routes.ts
 * @route POST /api/v1/payments/intent
 * @access Private (authenticated user)
 * @security Bearer token required.
 * @body { bookingId: string (UUID) }
 * @returns { clientSecret: string }
 */
export async function createPaymentIntent(req: AuthenticatedRequest, res: Response) {
  const userId = req.user!.id;
  const result = await PaymentService.createIntent(req.body, userId);
  res.status(201).json(result);
}

/**
 * @server\src\api.routes.ts
 * @route POST /api/v1/payments/webhook
 * @access Public (no JWT), protected by Stripe signature verification
 * @security Stripe signature verification required.
 */
export async function handleWebhook(req: express.Request, res: Response) {
  const signature = req.headers["stripe-signature"] as string;

  if (!signature) {
    res.status(400).send("Missing stripe-signature header");
    return;
  }

  await PaymentService.handleStripeWebhook(req.body, signature);
  res.status(200).json({ received: true });
}

/**
 * @server\src\api.routes.ts
 * @route POST /api/v1/payments/payout-lifecycle/run-now
 * @access Private (admin)
 * @security Bearer token required + ADMIN role.
 */
export async function runPayoutLifecycleNow(_req: AuthenticatedRequest, res: Response) {
  const job = await PaymentService.triggerPayoutLifecycle();
  res.status(202).json({
    message: "Payout lifecycle job queued",
    ...job,
  });
}
