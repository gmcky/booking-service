import { test, expect, type FrameLocator, type Page } from "@playwright/test";

// Real Stripe test-mode checkout end to end: requires a publishable key
// (NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY) and a `stripe listen --forward-to
// localhost:3000/api/v1/payments/webhook` process running locally so the
// payment_intent.succeeded webhook can flip the booking to CONFIRMED — see
// client/README.md. Skips gracefully when no key is configured.
const HAS_STRIPE_KEY = Boolean(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY);

// Far enough out that it won't collide with seeded bookings; a different
// property each run would also work, but a fixed low-traffic property (0
// bookings in seed data) keeps this deterministic. The default id only
// exists in the local dev seed — override via E2E_PROPERTY_ID to run
// against another environment's data.
const PROPERTY_ID =
  process.env.E2E_PROPERTY_ID ?? "d537c8b7-16a1-4ffd-bc33-faa6b1dd5a82"; // Trastevere Apartment with Rooftop
const GUEST_EMAIL = process.env.E2E_GUEST_EMAIL ?? "demo@booking.dev";
const GUEST_PASSWORD = process.env.E2E_GUEST_PASSWORD ?? "demo1234";

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/**
 * Opens a date-picker popover trigger and clicks the target date. Assumes
 * the target falls within the currently-displayed month (true for the
 * small day offsets this spec uses in the common case) — doesn't navigate
 * months, since the calendar caption isn't exposed as an accessible heading
 * to detect the displayed month from.
 */
async function pickDate(page: Page, target: Date) {
  await page.getByText("Add date").first().click();
  await page.waitForTimeout(300);

  const dayLabel = new RegExp(
    `${MONTH_NAMES[target.getMonth()]} ${target.getDate()}(st|nd|rd|th), ${target.getFullYear()}`,
    "i",
  );
  await page.getByRole("button", { name: dayLabel }).click();
  await page.waitForTimeout(300);
}

async function fillStripeCard(page: Page) {
  const paymentFrame: FrameLocator = page.frameLocator('iframe[src*="elements-inner-payment"]');
  await paymentFrame.getByText("Card", { exact: true }).first().click();
  await page.waitForTimeout(1000);

  await paymentFrame.locator("#payment-numberInput").fill("4242424242424242");
  await paymentFrame.locator("#payment-expiryInput").fill("12/34");
  await paymentFrame.locator("#payment-cvcInput").fill("123");

  const linkEmail = paymentFrame.locator("#payment-linkEmailInput");
  if (await linkEmail.isVisible().catch(() => false)) {
    await linkEmail.fill(`e2e-stripe-${Date.now()}@example.com`);
  }
}

test.describe("booking checkout with real Stripe test mode", () => {
  test.skip(!HAS_STRIPE_KEY, "no Stripe publishable key configured (NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY)");

  test("login -> reserve -> pay with 4242 -> webhook confirms booking", async ({ page }) => {
    test.setTimeout(60000);

    await page.goto("/login");
    await page.getByLabel("Email").fill(GUEST_EMAIL);
    await page.getByLabel("Password").fill(GUEST_PASSWORD);
    await page.getByRole("button", { name: /sign in/i }).click();
    await page.waitForURL("/");

    const checkIn = addDays(new Date(), 14);
    const checkOut = addDays(checkIn, 2);

    await page.goto(`/properties/${PROPERTY_ID}`);
    await page.waitForTimeout(1000);

    await pickDate(page, checkIn);
    await pickDate(page, checkOut);

    await page.getByRole("button", { name: "Reserve" }).click();
    await page.waitForURL(/\/checkout\?/, { timeout: 15000 });

    await page.getByRole("button", { name: /continue to payment/i }).click();
    await page.waitForTimeout(2000);

    await fillStripeCard(page);

    await page.getByRole("button", { name: /^pay \$/i }).click();
    await page.waitForURL(/\/confirmation\?bookingId=/, { timeout: 15000 });

    await expect(page.getByText("Booking confirmed")).toBeVisible({ timeout: 20000 });
    await expect(page.getByText("Payment successful")).toBeVisible();
  });
});
