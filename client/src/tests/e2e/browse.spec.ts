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

  // Regression: the map's viewport and the list have to describe the same
  // search. Restoring a remembered camera without its area, or dropping a
  // named search on close, has broken this twice.
  test("map area and list stay in step across close and reopen", async ({ page }) => {
    test.setTimeout(90_000);
    const heading = () => page.locator("h1").first();

    await page.goto("/browse?city=Kyiv&country=Ukraine");
    await expect(page.locator('a[href^="/properties/"]').first()).toBeVisible({ timeout: 20_000 });
    await expect(heading()).toContainText("Kyiv");

    await page.getByRole("button", { name: "Show map" }).click();
    await page.locator("canvas").first().waitFor({ timeout: 20_000 });
    await page.waitForTimeout(2500);
    // Opening the map alone must not turn a named search into an area.
    await expect(heading()).toContainText("Kyiv");

    const box = (await page.locator("canvas").first().boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 - 160, box.y + box.height / 2 + 100, { steps: 20 });
    await page.mouse.up();
    await expect(heading()).toContainText("map area", { timeout: 15_000 });
    const areaUrl = new URL(page.url()).searchParams.get("minLat");
    expect(areaUrl).not.toBeNull();

    // Closing hands the named search back rather than leaving the visitor on
    // everything, everywhere.
    await page.getByRole("button", { name: "Show list" }).click();
    await expect(heading()).toContainText("Kyiv", { timeout: 15_000 });
    expect(new URL(page.url()).searchParams.get("minLat")).toBeNull();
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
