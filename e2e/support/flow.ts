import path from "node:path";
import { expect, type Page } from "@playwright/test";

export const fixture = (name: string) => path.join(__dirname, "..", "fixtures", name);
export const TEST_EMAIL = "e2e.buyer@example.com";

async function cont(page: Page) {
  await page.getByRole("button", { name: "Continue", exact: true }).click();
}

/** Walks the intake. `until` stops on that step (already loaded) without completing it. */
export async function runOnboarding(
  page: Page,
  until: "goals" | "photos" | "delivery" | "review" | "done" = "done",
) {
  await page.goto("/start");
  await page.getByRole("button", { name: "Start" }).click();
  await page.waitForURL("**/onboarding/goals");
  if (until === "goals") return;
  await page.getByText("Sharper grooming").click();
  await cont(page);
  await page.waitForURL("**/onboarding/focus");
  await cont(page); // goal pre-selects facial hair + brows
  await page.waitForURL("**/onboarding/timeline");
  await page.getByText("Within 30 days").click();
  await cont(page);
  await page.waitForURL("**/onboarding/budget");
  await page.getByText("A little").click();
  await cont(page);
  for (const step of ["skin", "brows", "eyes", "hair", "smile", "jaw"]) {
    await page.waitForURL(`**/onboarding/${step}`);
    await page.getByRole("button", { name: "Skip" }).click();
  }
  await page.waitForURL("**/onboarding/constraints");
  await page.getByText("About 15 minutes a day").click();
  await cont(page);
  await page.waitForURL("**/onboarding/photo-guide");
  await page.getByRole("button", { name: "Got it" }).click();
  await page.waitForURL("**/onboarding/photos");
  if (until === "photos") return;
  await addFrontPhoto(page);
  await page.getByText("These are photos of me").click();
  await page.getByRole("button", { name: "Use these photos" }).click();
  await page.waitForURL("**/onboarding/delivery");
  if (until === "delivery") return;
  await page.locator("#email").fill(TEST_EMAIL);
  await page.getByRole("checkbox", { name: /photos are sent/ }).check();
  await page.getByRole("checkbox", { name: /accept the Terms/ }).check();
  await cont(page);
  await page.waitForURL("**/onboarding/review");
  if (until === "review") return;
  await page.getByRole("button", { name: "Continue to checkout" }).click();
  await page.waitForURL("**/checkout");
  // The order is opened by the checkout page itself: wait until a way to pay is on screen.
  await expect(page.getByRole("button", { name: /Pay \$29 \(simulated\)|Generate Pix code/ })).toBeVisible();
}

export async function addFrontPhoto(page: Page, name = "synthetic-front.jpg") {
  // The library input (the second file input) for the front slot.
  await page.locator('input[type="file"]').nth(1).setInputFiles(fixture(name));
  await expect(page.getByAltText("Your front photo")).toBeVisible();
}
