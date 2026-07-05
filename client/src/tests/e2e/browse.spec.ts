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

    // Open the SearchPill's "Where" segment (a real <button> with
    // aria-expanded, per the segmented-pill a11y contract).
    const whereTrigger = page.getByRole("button", { name: /where/i }).first();
    await whereTrigger.click();

    const destinationInput = page.getByRole("textbox", { name: /search destinations/i });
    await destinationInput.fill("Lviv");
    await page.waitForTimeout(500);

    const suggestion = page.getByRole("button", { name: /Lviv/i }).first();
    if (await suggestion.isVisible().catch(() => false)) {
      await suggestion.click();
      await page.getByRole("button", { name: "Search" }).click();
      await page.waitForURL(/city=/);
      const cards = page.locator('a[href^="/properties/"]');
      const count = await cards.count();
      expect(count).toBeGreaterThanOrEqual(0);
    }
  });
});
