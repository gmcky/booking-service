import express, { type Response } from "express";
import type { AuthenticatedRequest } from "../../shared/types/index.js";
import { getIdParam } from "../../shared/utils/request.helpers.js";
import { PaymentService } from "./payment.service.js";
import { stripe } from "../../shared/lib/stripe.js";
import { env } from "../../config/env.js";
import { logger } from "../../shared/lib/logger.js";
import { AppError } from "../../shared/middlewares/error.handler.js";

// ─── Existing endpoints ───────────────────────────────────────────────────────

/**
 * Create payment record (legacy / simple flow)
 * @route POST /api/v1/payments
 * @access Private
 * @body { bookingId, currency? }
 */
export async function createPayment(
  req: AuthenticatedRequest,
  res: Response,
) {
  const userId = req.user!.id;
  const payment = await PaymentService.create(req.body, userId);
  res.status(201).json(payment);
}

export async function getPaymentById(
  req: AuthenticatedRequest,
  res: Response,
) {
  const id = getIdParam(req);
  const userId = req.user!.id;
  const payment = await PaymentService.getById(id, userId);
  res.json(payment);
}

/**
 * Process payment (Manual trigger — for testing only)
 * @route POST /api/v1/payments/:id/process
 * @access Private
 * @deprecated Use webhook for production
 */
export async function processPayment(
  req: AuthenticatedRequest,
  res: Response,
) {
  const id = getIdParam(req);
  const userId = req.user!.id;
  const payment = await PaymentService.process(id, userId);
  res.json(payment);
}

export async function refundPayment(req: AuthenticatedRequest, res: Response) {
  const id = getIdParam(req);
  const userId = req.user!.id;
  const payment = await PaymentService.refund(id, userId);
  res.json(payment);
}

// ─── New Stripe endpoints (stubs) ─────────────────────────────────────────────

/**
 * Create a Stripe PaymentIntent and return the client_secret to the frontend.
 * The frontend uses Stripe.js / Elements to securely collect card details
 * and confirm the payment without card data ever touching our server (PCI-DSS).
 *
 * @route  POST /api/v1/payments/intent
 * @access Private (authenticated user)
 * @body   { bookingId: string (UUID), currency?: string (ISO-4217, default "usd") }
 *
 * TODO (implementation checklist):
 *   1. Validate body with Zod: createPaymentIntentSchema
 *   2. Fetch booking from DB; verify it belongs to req.user.id
 *   3. Verify booking.status === 'PENDING' (only pending bookings need payment)
 *   4. Check there is no existing SUCCESS payment for this booking (idempotency)
 *   5. Call stripe.paymentIntents.create({
 *        amount: Math.round(booking.totalPrice * 100),  // cents
 *        currency: body.currency ?? 'usd',
 *        metadata: { bookingId, userId },
 *        idempotencyKey: `intent_${bookingId}`,
 *      })
 *   6. Persist { bookingId, stripePaymentIntentId, status: 'PENDING' } to DB
 *   7. Return { clientSecret: paymentIntent.client_secret }
 */
export async function createPaymentIntent(
  req: AuthenticatedRequest,
  res: Response,
) {
  // TODO: implement (see checklist above)
  res.status(501).json({ message: "Not implemented yet" });
}

/**
 * Stripe webhook handler — the ONLY place payment status should be set to SUCCESS.
 *
 * @route  POST /api/v1/payments/webhook
 * @access Public (no JWT), protected by Stripe signature verification
 *
 * ⚠️  IMPORTANT: this route MUST receive the RAW body (Buffer), NOT parsed JSON.
 *    Add `express.raw({ type: 'application/json' })` middleware on this route only.
 *    See payment.routes.ts — the middleware is already applied there.
 *
 * TODO (implementation checklist):
 *   1. Read raw body from req.body (Buffer)
 *   2. Read stripe-signature header
 *   3. stripe.webhooks.constructEvent(rawBody, sig, env.STRIPE_WEBHOOK_SECRET)
 *      → throws on invalid signature → return 400
 *   4. Switch on event.type:
 *        'payment_intent.succeeded'      → call PaymentService.handlePaymentSuccess
 *        'payment_intent.payment_failed' → call PaymentService.handlePaymentFailed
 *        'charge.refunded'               → call PaymentService.handleRefundCompleted
 *        default                         → log & ignore
 *   5. Always return 200 quickly (Stripe retries on non-2xx)
 *   6. Implement idempotency: store processed stripeEvent.id in DB,
 *      skip events already recorded (Stripe may re-deliver on network errors)
 *
 * Test locally:
 *   stripe listen --forward-to localhost:3000/api/v1/payments/webhook
 */
export async function handleWebhook(req: express.Request, res: Response) {
  // TODO: implement (see checklist above)
  res.status(200).json({ received: true });
}
