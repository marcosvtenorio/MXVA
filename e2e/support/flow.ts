import path from "node:path";
import { expect, type Page } from "@playwright/test";

export const fixture = (name: string) => path.join(__dirname, "..", "fixtures", name);
export const TEST_EMAIL = "e2e.buyer@example.com";

async function cont(page: Page) {
  await page.getByRole("button", { name: "Continue", exact: true }).click();
}

/** Walks the intake. `until` stops on that step (already loaded) without completing it. */
export async function runOnboarding(page: Page, until: "photos" | "constraints" | "delivery" | "review" | "done" = "done") {
  // The landing's Start links here: the intake opens on the photo step.
  await page.goto("/onboarding/photos");
  if (until === "photos") return;
  await addFrontPhoto(page);
  await page.getByText("These are photos of me").click();
  await page.getByRole("button", { name: "Use these photos" }).click();
  await page.waitForURL("**/onboarding/constraints");
  if (until === "constraints") return;
  await cont(page);
  await page.waitForURL("**/onboarding/delivery");
  if (until === "delivery") return;
  await page.locator("#email").fill(TEST_EMAIL);
  await page.getByRole("checkbox", { name: /my photos go to/ }).check();
  await page.getByRole("checkbox", { name: /accept the Terms/ }).check();
  await cont(page);
  await page.waitForURL("**/onboarding/review");
  if (until === "review") return;
  await page.getByRole("button", { name: "Continue to checkout" }).click();
  await page.waitForURL("**/checkout");
  // The order is opened by the checkout page itself: wait until a way to pay is on screen.
  await expect(page.getByRole("button", { name: /Pay \$29 \(simulated\)|Pay R\$ 47,99 with Pix/ })).toBeVisible();
}

/** Picks a way to pay in the checkout's method cards (the radio itself is visually hidden). */
export async function chooseMethod(page: Page, method: "Pix" | "Card") {
  await page.locator("label").filter({ has: page.getByRole("radio", { name: new RegExp(`^${method}\\b`) }) }).click();
  await expect(page.getByRole("radio", { name: new RegExp(`^${method}\\b`) })).toBeChecked();
}

/** The Pix QR code: shown at once on a computer, one tap away on a phone (which pays by copy and paste). */
export async function showPixQr(page: Page) {
  const qr = page.getByRole("img", { name: "Pix QR code" });
  await expect(page.getByRole("button", { name: /Copy Pix code|Copied/ })).toBeVisible();
  if (!(await qr.isVisible())) await page.getByText("Show the QR code instead").click();
  await expect(qr).toBeVisible();
}

export async function addFrontPhoto(page: Page, name = "synthetic-front.jpg") {
  // The library input (the second file input) for the front slot.
  await page.locator('input[type="file"]').nth(1).setInputFiles(fixture(name));
  // On-device processing can take a few seconds while many tests share the machine.
  await expect(page.getByAltText("Your front photo")).toBeVisible({ timeout: 15_000 });
}
