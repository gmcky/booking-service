import { test, expect } from "@playwright/test";

const uniqueEmail = () => `test+${Date.now()}@example.com`;

test.describe("auth flow", () => {
  test("register → home → profile → logout", async ({ page }) => {
    const email = uniqueEmail();

    await page.goto("/register");
    await page.getByLabel("First name").fill("E2E");
    await page.getByLabel("Last name").fill("User");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill("Tr0ub4dor&3xyz");
    await page.getByRole("button", { name: /create account/i }).click();

    // Post-auth destination is "/" (home) unless a returnTo param is present.
    await page.waitForURL("/");
    await expect(page.getByText("Host dashboard")).toBeVisible();

    // Name is rendered as input values on the profile page, not text nodes.
    await page.goto("/profile");
    await expect(page.getByLabel("First name")).toHaveValue("E2E");
    await expect(page.getByLabel("Last name")).toHaveValue("User");

    await page.getByRole("button", { name: /sign out/i }).click();
    await page.waitForURL(/\/login/);
  });

  test("login with valid credentials", async ({ page }) => {
    // Public seeded account (demo@booking.dev / demo1234, see server/prisma/seed.ts) —
    // has no bookings/properties, safe for e2e to log into repeatedly.
    await page.goto("/login");
    await page.getByLabel("Email").fill("demo@booking.dev");
    await page.getByLabel("Password").fill("demo1234");
    await page.getByRole("button", { name: /sign in/i }).click();

    await page.waitForURL("/");
    await expect(page.getByText("Host dashboard")).toBeVisible();
  });

  test("login honors returnTo for protected pages", async ({ page }) => {
    await page.goto("/bookings");
    await page.waitForURL(/\/login\?returnTo=%2Fbookings/);

    await page.getByLabel("Email").fill("demo@booking.dev");
    await page.getByLabel("Password").fill("demo1234");
    await page.getByRole("button", { name: /sign in/i }).click();

    await page.waitForURL("/bookings");
  });

  test("protected route redirects unauthenticated users", async ({ page }) => {
    await page.goto("/profile");
    await page.waitForURL(/\/login\?returnTo=%2Fprofile/);
  });
});
