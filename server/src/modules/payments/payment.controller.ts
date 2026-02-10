import type { Request, Response } from "express";
import type { AuthenticatedRequest } from "../../shared/types/index.js";
import { getIdParam } from "../../shared/utils/request.helpers.js";
import { PaymentService } from "./payment.service.js";
import { logger } from "../../shared/lib/logger.js";

// TODO: Import Stripe for webhook signature verification
// import Stripe from 'stripe';
// import { env } from '../../config/env.js';
// const stripe = new Stripe(env.STRIPE_SECRET_KEY);

/**
 * Create payment intent (Step 1 of payment flow)
 * @route POST /api/v1/payments
 * @access Private
 * @body { bookingId, currency? }
 */

export async function createPayment(req: AuthenticatedRequest, res: Response) {
  // TODO: Validate request body with Zod
  // Schema: { bookingId: string (UUID), currency?: string }

  const userId = req.user!.id;

  // TODO: Return client_secret for frontend
  // Frontend will use Stripe.js to complete payment
  // const { clientSecret, paymentIntentId } = await PaymentService.create(req.body, userId);
  // res.status(201).json({ clientSecret, paymentIntentId });

  const payment = await PaymentService.create(req.body, userId);
  res.status(201).json(payment);

  // TODO: Add rate limiting - prevent payment spam
  // Max 5 payment attempts per booking
}

export async function getPaymentById(req: AuthenticatedRequest, res: Response) {
  const id = getIdParam(req);
  const userId = req.user!.id;
  const payment = await PaymentService.getById(id, userId);
  res.json(payment);
}

/**
 * Process payment (Manual trigger - for testing only)
 * @route POST /api/v1/payments/:id/process
 * @access Private
 * @deprecated Use webhook for production
 */
export async function processPayment(req: AuthenticatedRequest, res: Response) {
  // ⚠️ WARNING: This should NOT be used in production!
  // Payments should be confirmed via Stripe webhook, not user request
  // Reason: Users could fake payment success

  // TODO: Remove this endpoint in production or restrict to admins only
  // if (env.NODE_ENV === 'production') {
  //   throw new AppError(403, 'Use Stripe webhook for payment confirmation');
  // }

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

/**
 * Handle Stripe webhook events
 * @route POST /api/v1/payments/webhook
 * @access Public (but verified via signature)
 *
 * CRITICAL SETUP REQUIREMENTS:
 * 1. Register endpoint in Stripe Dashboard
 * 2. Get webhook secret (starts with whsec_)
 * 3. Use RAW body (not JSON parsed)
 * 4. Verify signature before processing
 */
export async function handleWebhook(req: Request, res: Response) {
  // TODO: CRITICAL - Get RAW body, not JSON
  // Express json() middleware parses body automatically,
  // but Stripe signature verification needs raw buffer
  //
  // Solution: Apply express.raw() middleware to this route ONLY
  // In routes file:
  // router.post('/webhook',
  //   express.raw({ type: 'application/json' }), // Get raw body
  //   handleWebhook
  // );

  // TODO: Get Stripe signature from headers
  // const signature = req.headers['stripe-signature'];
  // if (!signature) {
  //   logger.error('Missing Stripe signature header');
  //   return res.status(400).json({ error: 'Missing signature' });
  // }

  // TODO: Verify and process webhook
  // try {
  //   await PaymentService.handleStripeWebhook(
  //     req.body, // Raw body (Buffer or string)
  //     signature
  //   );
  //
  //   // Return 200 ASAP (Stripe retries on non-200 responses)
  //   res.status(200).json({ received: true });
  //
  // } catch (error) {
  //   logger.error({
  //     error: error.message,
  //     body: req.body?.toString?.('utf-8')
  //   }, 'Webhook processing failed');
  //
  //   // Return 400 for invalid signature (don't retry)
  //   // Return 500 for processing errors (Stripe will retry)
  //   const statusCode = error instanceof AppError ? error.statusCode : 500;
  //   res.status(statusCode).json({ error: error.message });
  // }

  // TEMPORARY placeholder
  res.status(200).send();

  // TODO: Add monitoring/alerting for webhook failures
  // High webhook failure rate indicates system issues

  // TODO: Test webhook locally using Stripe CLI
  // stripe listen --forward-to localhost:3000/api/v1/payments/webhook

  // TODO: Handle webhook events idempotently
  // Stripe may send same event multiple times (network retries)
  // Store processed event IDs in database to prevent duplicate processing
}
