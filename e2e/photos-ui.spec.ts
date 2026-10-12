import { expect, test } from "@playwright/test";
import { addFrontPhoto, fixture, runOnboarding } from "./support/flow";

test.describe("photo step", () => {
  test("rejects files that are not photos with a clear message", async ({ page }) => {
    await runOnboarding(page, "photos");
    await page.locator('input[type="file"]').nth(1).setInputFiles(fixture("not-an-image.jpg"));
    await expect(page.locator('main [role="alert"]')).toContainText("isn't a JPEG, PNG, WebP or HEIC photo");
    await expect(page.getByAltText("Your front photo")).toHaveCount(0);
  });

  test("a too-dark photo is shown with the reason and can't be used", async ({ page }) => {
    await runOnboarding(page, "photos");
    await page.locator('input[type="file"]').nth(1).setInputFiles(fixture("too-dark.jpg"));
    await expect(page.getByAltText("Your front photo")).toBeVisible();
    await expect(page.getByText(/too dark to use/)).toBeVisible();
    await page.getByText("These are photos of me").click();
    await page.getByRole("button", { name: "Use these photos" }).click();
    await expect(page.locator('main [role="alert"]')).toContainText("Add a front-facing photo");
    await expect(page).toHaveURL(/\/onboarding\/photos/);
  });

  test("ownership confirmation is required", async ({ page }) => {
    await runOnboarding(page, "photos");
    await addFrontPhoto(page);
    await page.getByRole("button", { name: "Use these photos" }).click();
    await expect(page.locator('main [role="alert"]')).toContainText("Confirm these are photos of you");
  });

  test("reloading the photo step removes the photos", async ({ page }) => {
    await runOnboarding(page, "photos");
    await addFrontPhoto(page);
    await page.reload();
    await expect(page.getByAltText("Your front photo")).toHaveCount(0);
    await expect(page.getByText(/Reloading or closing it clears them/)).toBeVisible();
  });

  test("optional profile photos can be added and removed", async ({ page }) => {
    await runOnboarding(page, "photos");
    await page.locator('input[type="file"]').nth(2).setInputFiles(fixture("synthetic-left.jpg"));
    await expect(page.getByAltText("Your left profile photo")).toBeVisible();
    await page.getByRole("button", { name: "Remove" }).click();
    await expect(page.getByAltText("Your left profile photo")).toHaveCount(0);
  });
});
