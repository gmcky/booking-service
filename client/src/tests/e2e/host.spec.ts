import path from "node:path";
import { test, expect } from "@playwright/test";

const testPhoto = path.join(process.cwd(), "src/tests/e2e/fixtures/test-photo.jpg");

// Defaults exist only in the local dev seed — override via env to run
// against another environment (any account works; the spec creates and
// soft-deletes its own listing).
const HOST_EMAIL = process.env.E2E_HOST_EMAIL ?? "owner@demo.com";
const HOST_PASSWORD = process.env.E2E_HOST_PASSWORD ?? "owner1pass";

async function login(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(HOST_EMAIL);
  await page.getByLabel("Password").fill(HOST_PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL("/");
}

test.describe("host: create with photo → edit → deactivate", () => {
  test("full listing lifecycle", async ({ page }) => {
    await login(page);

    const title = `E2E Test Listing ${Date.now()}`;

    await page.goto("/host/listing");
    await page.getByLabel("Title").fill(title);
    await page
      .getByLabel("Description")
      .fill("Created by an automated e2e smoke test — safe to remove.");
    await page.getByLabel("Street", { exact: true }).fill("Test Street");
    await page.getByLabel("House no.").fill("1");
    await page.getByLabel("City").fill("Testville");
    await page.getByLabel("Country").fill("Ukraine");
    await page.getByLabel("Max guests").fill("4");
    await page.getByLabel("Price / night").fill("100");

    await page.setInputFiles('input[type="file"]', testPhoto);
    await page.waitForTimeout(2000);

    await page.getByRole("button", { name: "Publish" }).click();
    await page.waitForURL("/host/properties", { timeout: 15000 });
    await expect(page.getByText(title)).toBeVisible();

    // Edit
    const card = page.locator("section > div").filter({ hasText: title });
    await card.getByRole("button", { name: "Edit" }).click();
    await page.waitForURL(/\/host\/properties\/.+\/edit/);
    await expect(page.getByLabel("Title")).toHaveValue(title);

    const updatedTitle = `${title} (edited)`;
    await page.getByLabel("Title").fill(updatedTitle);
    await page.getByRole("button", { name: "Save changes" }).click();
    await page.waitForURL("/host/properties", { timeout: 15000 });
    await expect(page.getByText(updatedTitle)).toBeVisible();

    // Deactivate — this is the only "remove" a host has for their own
    // listings (soft-delete, isActive: false); it still shows in their own
    // list as Inactive, matching the "Remove" button's actual behavior.
    const updatedCard = page.locator("section > div").filter({ hasText: updatedTitle });
    await updatedCard.getByRole("button", { name: "Deactivate" }).click();
    await expect(updatedCard.getByRole("button", { name: "Activate" })).toBeVisible({
      timeout: 5000,
    });
  });
});
