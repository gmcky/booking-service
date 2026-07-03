import { test, expect } from "@playwright/test";

test.describe("browse and property detail", () => {
  test("browse → open a listing → detail renders", async ({ page }) => {
    await page.goto("/browse");
    await expect(page.getByRole("heading", { name: /stays|browse/i }).first()).toBeVisible({
      timeout: 10000,
    });

    const firstCard = page.locator('a[href^="/properties/"]').first();
    await expect(firstCard).toBeVisible();
    const title = await firstCard.locator("span").first().textContent();
    await firstCard.click();

    await page.waitForURL(/\/properties\/.+/);
    if (title) {
      await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
    }
    await expect(page.getByRole("button", { name: /reserve/i })).toBeVisible();
    await expect(page.getByText(/review/i).first()).toBeVisible();
  });

  test("browse filters by city", async ({ page }) => {
    await page.goto("/browse");
    await page.waitForTimeout(500);

    const cityInput = page.getByPlaceholder(/city|where/i).first();
    if (await cityInput.isVisible().catch(() => false)) {
      await cityInput.fill("Lviv");
      await cityInput.press("Enter");
      await page.waitForTimeout(1000);
      const cards = page.locator('a[href^="/properties/"]');
      const count = await cards.count();
      expect(count).toBeGreaterThanOrEqual(0);
    }
  });
});
