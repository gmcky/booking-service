import Stripe from "stripe";
import { env } from "../../config/env.js";

/** Singleton Stripe client reused across modules. */
export const stripe = new Stripe(env.STRIPE_SECRET_KEY, {
  apiVersion: "2026-02-25.clover",
  typescript: true,
});
