import { expect, test } from "@playwright/test";
import { addFrontPhoto, runOnboarding } from "./support/flow";

test.describe("payment and recovery", () => {
  test("a payment that opens another page: server-confirmed, reselect photos, no second charge", async ({ page }) => {
    await runOnboarding(page);
    await page.getByRole("button", { name: "Simulate bank page" }).click();
    await page.waitForURL("**/processing");
    await expect(page.getByRole("heading", { name: "Add your front photo again" })).toBeVisible();
    await expect(page.getByText(/there is no second charge/)).toBeVisible();

    await addFrontPhoto(page);
    await page.getByText("These are photos of me").click();
    // Consent lived in memory and was lost with the reload, so it is asked again.
    await page.getByRole("checkbox", { name: /photo is sent/ }).check();
    await page.getByRole("button", { name: "Create my report" }).click();
    await page.waitForURL("**/result", { timeout: 60_000 });
    await expect(page.getByRole("heading", { name: "Your concept and plan" })).toBeVisible();

    // Starting checkout again in this browser never creates a second charge.
    const again = await page.evaluate(async () => {
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: { "content-type": "application/json", "x-mxva-request": "1" },
        body: JSON.stringify({
          sku: "mxva_report_v1",
          email: "e2e.buyer@example.com",
          adultConfirmed: true,
          faceProcessingConsentVersion: "2026-10-11.v1",
          termsVersion: "2026-10-11.v1",
          marketingOptIn: false,
        }),
      });
      return response.json();
    });
    expect(again.alreadyPaid).toBe(true);
  });

  test("the client cannot fake a paid order: fulfilment before payment is refused", async ({ page }) => {
    await runOnboarding(page);
    const result = await page.evaluate(async () => {
      const form = new FormData();
      form.set("front", new File([new Uint8Array([0xff, 0xd8, 0xff])], "front.jpg", { type: "image/jpeg" }));
      form.set("input", "{}");
      form.set("faceProcessingConsent", "true");
      form.set("paid", "true");
      const response = await fetch("/api/fulfill?paid=true", { method: "POST", body: form, headers: { "x-mxva-request": "1" } });
      return { status: response.status, body: await response.json() };
    });
    expect(result.status).toBe(402);
    expect(result.body.error.code).toBe("ORDER_NOT_PAID");
  });

  test("a refresh after delivery points to the email, not to another payment", async ({ page }) => {
    await runOnboarding(page);
    await page.getByRole("button", { name: /Pay \$29 \(simulated\)/ }).click();
    await page.waitForURL("**/result", { timeout: 60_000 });
    await page.reload();
    await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();
    await expect(page.getByText(/in your email/)).toBeVisible();
  });
});
