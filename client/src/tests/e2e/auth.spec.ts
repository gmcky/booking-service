import { test, expect } from "@playwright/test";

const uniqueEmail = () => `test+${Date.now()}@example.com`;

test.describe("auth flow", () => {
  test("register → profile → logout", async ({ page }) => {
    const email = uniqueEmail();

    await page.goto("/register");
    await page.getByLabel("Name").fill("E2E User");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill("password123");
    await page.getByRole("button", { name: /create account/i }).click();

    await page.waitForURL("/profile");
    await expect(page.getByText("E2E User")).toBeVisible();

    await page.getByRole("button", { name: /sign out/i }).click();
    await page.waitForURL("/login");
  });

  test("login with valid credentials", async ({ page }) => {
    // Requires a seeded user: test@example.com / password123
    await page.goto("/login");
    await page.getByLabel("Email").fill("test@example.com");
    await page.getByLabel("Password").fill("password123");
    await page.getByRole("button", { name: /sign in/i }).click();

    await page.waitForURL("/profile");
    await expect(page.getByText("test@example.com")).toBeVisible();
  });

  test("protected route redirects unauthenticated users", async ({ page }) => {
    await page.goto("/profile");
    await page.waitForURL(/\/login/);
  });
});
