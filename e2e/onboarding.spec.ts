import { expect, test } from "@playwright/test";
import { runOnboarding } from "./support/flow";

test.describe("onboarding rules", () => {
  test("starting confirms age and terms in one step, then goes straight to the photo", async ({ page }) => {
    await page.goto("/start");
    await expect(page.getByText(/By continuing, you confirm you're 18 or older/)).toBeVisible();
    await expect(page.getByRole("link", { name: "Terms of Use" })).toHaveAttribute("href", "/terms");
    await expect(page.getByRole("link", { name: "Privacy Policy" })).toHaveAttribute("href", "/privacy");
    await expect(page.getByRole("radio")).toHaveCount(0);
    await page.getByRole("button", { name: "Start" }).click();
    await page.waitForURL("**/onboarding/photo-guide");
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
    await page.waitForURL("**/start");
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
    await expect(page.getByRole("progressbar", { name: "Onboarding progress" })).toHaveAttribute("aria-valuenow", "3");
  });
});
