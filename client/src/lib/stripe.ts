import { loadStripe, type Stripe } from "@stripe/stripe-js";

/** Module-level singleton so <Elements> doesn't reload stripe.js on every render. */
let stripePromise: Promise<Stripe | null> | null = null;

export function getStripe(): Promise<Stripe | null> {
  if (!stripePromise) {
    const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
    if (!key) {
      throw new Error(
        "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is not set. Add it to client/.env.local.",
      );
    }
    // Test-mode keys make Stripe.js inject a floating "Developers" assistant
    // widget on the payment page — demo visitors would see it too.
    stripePromise = loadStripe(key, { developerTools: { assistant: { enabled: false } } });
  }
  return stripePromise;
}
