import express, { type Response } from "express";
import type { AuthenticatedRequest } from "../../shared/types/index.js";
import { getIdParam } from "../../shared/utils/request.helpers.js";
import { PaymentService } from "./payment.service.js";
import type { RequestRefundInput, RejectRefundInput } from "./payment.types.js";

/**
 * Create payment record using the legacy payment flow.
 * @route POST /api/v1/payments
 * @access Private
 * @body { bookingId, currency? }
 */
export async function createPayment(req: AuthenticatedRequest, res: Response) {
  const userId = req.user!.id;
  const payment = await PaymentService.create(req.body, userId);
  res.status(201).json(payment);
}

export async function getPaymentById(req: AuthenticatedRequest, res: Response) {
  const id = getIdParam(req);
  const userId = req.user!.id;
  const payment = await PaymentService.getById(id, userId);
  res.json(payment);
}

/**
 * Process payment manually for testing or operational intervention.
 * @route POST /api/v1/payments/:id/process
 * @access Private
 * @deprecated Use webhook for production
 */
export async function processPayment(req: AuthenticatedRequest, res: Response) {
  const id = getIdParam(req);
  const userId = req.user!.id;
  const payment = await PaymentService.process(id, userId);
  res.json(payment);
}

export async function requestRefund(req: AuthenticatedRequest, res: Response) {
  const id = getIdParam(req);
  const userId = req.user!.id;
  const { reason } = req.body as RequestRefundInput;
  const payment = await PaymentService.requestRefund(id, userId, reason);
  res.json(payment);
}

export async function approveRefund(req: AuthenticatedRequest, res: Response) {
  const id = getIdParam(req);
  const adminId = req.user!.id;
  const payment = await PaymentService.approveRefund(id, adminId);
  res.json(payment);
}

export async function rejectRefund(req: AuthenticatedRequest, res: Response) {
  const id = getIdParam(req);
  const adminId = req.user!.id;
  const { reason } = req.body as RejectRefundInput;
  const payment = await PaymentService.rejectRefund(id, adminId, reason);
  res.json(payment);
}

/**
 * Create a Stripe PaymentIntent and return the client_secret to the frontend.
 * Card data collection and confirmation are handled by Stripe.js/Elements.
 *
 * @route POST /api/v1/payments/intent
 * @access Private (authenticated user)
 * @body { bookingId: string (UUID) }
 * @returns { clientSecret: string }
 */
export async function createPaymentIntent(
  req: AuthenticatedRequest,
  res: Response,
) {
  const userId = req.user!.id;
  const result = await PaymentService.createIntent(req.body, userId);
  res.status(201).json(result);
}

/**
 * Stripe webhook handler.
 * Payment status transitions to SUCCESS must be performed via verified webhooks.
 *
 * @route POST /api/v1/payments/webhook
 * @access Public (no JWT), protected by Stripe signature verification
 * This route requires the raw request body (Buffer), not parsed JSON.
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
