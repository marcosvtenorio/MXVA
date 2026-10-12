import { expect, test } from "@playwright/test";
import { runOnboarding } from "./support/flow";

test.describe("onboarding rules", () => {
  test("starting confirms age and terms in one step, with the policies linked", async ({ page }) => {
    await page.goto("/start");
    await expect(page.getByText(/By continuing, you confirm you're 18 or older/)).toBeVisible();
    await expect(page.getByRole("link", { name: "Terms of Use" })).toHaveAttribute("href", "/terms");
    await expect(page.getByRole("link", { name: "Privacy Policy" })).toHaveAttribute("href", "/privacy");
    await expect(page.getByRole("radio")).toHaveCount(0);
    await page.getByRole("button", { name: "Start" }).click();
    await page.waitForURL("**/onboarding/goals");
  });

  test("deep links fall back to the first incomplete step", async ({ page }) => {
    await page.goto("/onboarding/review");
    await page.waitForURL("**/start");
  });

  test("conditionals: focus limit, exclusive 'nothing specific', facial-hair branch, dental note", async ({ page }) => {
    await runOnboarding(page, "goals");
    await page.getByText("My overall look").click();
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page.waitForURL("**/focus");
    for (const area of ["Skin", "Brows", "Hair", "Smile"]) await page.getByText(area, { exact: true }).click();
    await expect(page.getByText("4 of 4 chosen")).toBeVisible();
    await expect(page.getByRole("checkbox", { name: "Facial hair" })).toBeDisabled();
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page.waitForURL("**/timeline");
    await page.getByText("Within 90 days").click();
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page.waitForURL("**/budget");
    await page.getByText("Flexible", { exact: true }).click();
    await page.getByRole("button", { name: "Continue", exact: true }).click();

    await page.waitForURL("**/skin");
    await page.getByText("A clearer look").click();
    await page.getByText("Nothing specific").click();
    await expect(page.getByRole("checkbox", { name: "A clearer look" })).not.toBeChecked();
    await expect(page.getByRole("checkbox", { name: "Nothing specific" })).toBeChecked();
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page.waitForURL("**/brows");
    await page.getByRole("button", { name: "Skip" }).click();
    await page.waitForURL("**/eyes");
    await page.getByRole("button", { name: "Skip" }).click();

    await page.waitForURL("**/hair");
    await expect(page.getByText("A cleaner beard shape")).toHaveCount(0);
    await page.getByText("I have or want facial hair").click();
    await expect(page.getByText("A cleaner beard shape")).toBeVisible();
    await page.getByText("Not relevant to me").click();
    await expect(page.getByText("A cleaner beard shape")).toHaveCount(0);
    await page.getByRole("button", { name: "Skip" }).click();

    await page.waitForURL("**/smile");
    await page.getByText("Facts about whitening").click();
    await expect(page.getByText(/questions to bring to a dentist/)).toBeVisible();
  });

  test("continue without an answer shows an accessible error", async ({ page }) => {
    await runOnboarding(page, "goals");
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await expect(page.locator('main [role="alert"]')).toContainText("Pick the one that matters most");
    await expect(page).toHaveURL(/\/onboarding\/goals$/);
  });

  test("no consent, no checkout", async ({ page }) => {
    await runOnboarding(page, "delivery");
    await page.locator("#email").fill("someone@example.com");
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await expect(page.getByText("We need your consent to process your photos.")).toBeVisible();
    await expect(page).toHaveURL(/\/onboarding\/delivery$/);
  });

  test("a reload keeps survey answers, but never photos or the email", async ({ page }) => {
    await runOnboarding(page, "review");
    await page.reload();
    // Photos are gone, so the guard sends the buyer back to the photo step with a notice.
    await page.waitForURL("**/onboarding/photos");
    await expect(page.getByRole("status")).toContainText("cleared when the page reloaded");
    await page.goto("/onboarding/timeline");
    await expect(page.getByRole("radio", { name: /Within 30 days/ })).toBeChecked();
  });

  test("focus moves to the question on each step and progress is announced", async ({ page }) => {
    await runOnboarding(page, "goals");
    await expect(page.getByRole("heading", { level: 1 })).toBeFocused();
    await expect(page.getByRole("progressbar", { name: "Onboarding progress" })).toHaveAttribute("aria-valuenow", "2");
  });
});
