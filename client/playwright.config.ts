import { defineConfig, devices } from "@playwright/test";

// Next.js loads .env.local itself for the dev server, but this config runs in
// a separate Node process (the Playwright test runner) that doesn't — needed
// so checkout.spec.ts can see NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY to decide
// whether to skip.
try {
  process.loadEnvFile(".env.local");
} catch {
  // missing/unreadable .env.local is fine — the Stripe spec just skips.
}

export default defineConfig({
  testDir: "./src/tests/e2e",
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: "line",
  use: {
    baseURL: "http://localhost:3001",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
