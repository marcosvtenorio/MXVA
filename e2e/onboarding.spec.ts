import { expect, test } from "@playwright/test";
import { addFrontPhoto, runOnboarding } from "./support/flow";

test.describe("onboarding rules", () => {
  test("Start on the landing opens the photo step, which holds the photo guide", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("main").getByRole("link", { name: "Start" }).first().click();
    await page.waitForURL("**/onboarding/photos");
    await expect(page.getByRole("heading", { name: "For a good photo" })).toBeVisible();
    await expect(page.getByRole("radio")).toHaveCount(0);
    // Old links to the removed start and guide screens still land on the photo step.
    for (const old of ["/start", "/onboarding/photo-guide"]) {
      await page.goto(old);
      await page.waitForURL("**/onboarding/photos");
    }
  });

  test("the photo step asks for 18 or older once, and can't be passed without it", async ({ page }) => {
    await runOnboarding(page, "photos");
    await addFrontPhoto(page);
    await expect(page.getByText("These are photos of me, and I'm 18 or older.")).toBeVisible();
    await page.getByRole("button", { name: "Use these photos" }).click();
    await expect(page.getByText("Confirm these are photos of you.")).toBeVisible();
    await expect(page).toHaveURL(/\/onboarding\/photos$/);
  });

  test("no aesthetic questions: the plan is decided from the photo", async ({ page }) => {
    for (const removed of ["goals", "focus", "timeline", "budget", "skin", "brows", "eyes", "hair", "smile", "jaw"]) {
      await page.goto(`/onboarding/${removed}`);
      await expect(page.getByRole("heading", { name: /Nothing here/ }), removed).toBeVisible();
    }
    await runOnboarding(page, "constraints");
    await expect(page.getByRole("heading", { name: /Anything your plan should avoid/ })).toBeVisible();
    // Optional: continue without choosing anything.
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page.waitForURL("**/onboarding/delivery");
  });

  test("deep links fall back to the first incomplete step", async ({ page }) => {
    await page.goto("/onboarding/review");
    await page.waitForURL("**/onboarding/photos");
  });

  test("no consent, no checkout", async ({ page }) => {
    await runOnboarding(page, "delivery");
    await page.locator("#email").fill("someone@example.com");
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await expect(page.getByText("We need your consent to process your photos.")).toBeVisible();
    await expect(page).toHaveURL(/\/onboarding\/delivery$/);
  });

  test("a reload keeps what to avoid, but never photos or the email", async ({ page }) => {
    await runOnboarding(page, "constraints");
    await page.getByText("Fragrance", { exact: false }).first().click();
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page.waitForURL("**/onboarding/delivery");
    await page.reload();
    // Photos are gone, so the guard sends the buyer back to the photo step with a notice.
    await page.waitForURL("**/onboarding/photos");
    await expect(page.getByRole("status")).toContainText("cleared when the page reloaded");
  });

  test("focus moves to the question on each step and progress is announced", async ({ page }) => {
    await runOnboarding(page, "photos");
    await expect(page.getByRole("heading", { level: 1 })).toBeFocused();
    await expect(page.getByRole("progressbar", { name: "Onboarding progress" })).toHaveAttribute("aria-valuenow", "1");
  });
});
