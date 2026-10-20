import { expect, test } from "@playwright/test";
import { addFrontPhoto, runOnboarding } from "./support/flow";

test.describe("payment and recovery", () => {
  test("a payment that opens another page: server-confirmed, reselect photos, no second charge", async ({ page }) => {
    // Waits for the queue to email the report.
    test.slow();
    await runOnboarding(page);
    await page.getByRole("button", { name: "Simulate bank page" }).click();
    await page.waitForURL("**/processing");
    await expect(page.getByRole("heading", { name: "Add your front photo again" })).toBeVisible();
    await expect(page.getByText(/There is no second charge/)).toBeVisible();

    await addFrontPhoto(page);
    await page.getByText("These are photos of me").click();
    // Consent lived in memory and was lost with the reload, so it is asked again.
    await page.getByRole("checkbox", { name: /my photo goes to/ }).check();
    await page.getByRole("button", { name: "Create my report" }).click();
    await expect(page.getByRole("heading", { name: /Request received/ })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("heading", { name: /Your report is in your email/ })).toBeVisible({ timeout: 60_000 });

    // The report was delivered, so checking out again is a new purchase (a new order), not a
    // second charge for this one. Unfinished paid orders still block it (unit-tested).
    const again = await page.evaluate(async () => {
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: { "content-type": "application/json", "x-mxva-request": "1" },
        body: JSON.stringify({
          sku: "mxva_report_v1",
          method: "card",
          email: "e2e.buyer@example.com",
          adultConfirmed: true,
          faceProcessingConsentVersion: "2026-10-20.v2",
          termsVersion: "2026-10-11.v1",
          marketingOptIn: false,
        }),
      });
      return response.json();
    });
    expect(again.alreadyPaid).toBe(false);
    expect(again.order.status).toBe("pending_payment");
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

  test("a refresh after the request, and after delivery, points to the email, not to another payment", async ({ page }) => {
    // Waits for the queue to email the report.
    test.slow();
    await runOnboarding(page);
    await page.getByRole("button", { name: /Pay \$29 \(simulated\)/ }).click();
    await expect(page.getByRole("heading", { name: /Request received/ })).toBeVisible({ timeout: 30_000 });
    await page.reload();
    await expect(page.getByRole("heading", { name: /Your report is (being made|in your email)/ })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("heading", { name: /Your report is in your email/ })).toBeVisible({ timeout: 60_000 });
    await page.reload();
    await expect(page.getByRole("heading", { name: /Your report is in your email/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Pay/ })).toHaveCount(0);
  });

  test("checkout recovers by itself when the connection comes back (no reload, nothing to redo)", async ({ page, context }) => {
    await runOnboarding(page, "review");
    // The connection drops just as checkout loads (production prefetches the page itself).
    await page.route("**/api/checkout/options", (route) => route.abort("internetdisconnected"));
    await page.getByRole("button", { name: "Continue to checkout" }).click();
    await expect(page.getByRole("button", { name: "Try again" })).toBeVisible({ timeout: 15_000 });
    await page.unroute("**/api/checkout/options");
    // Back online: the page loads checkout again on its own, photo and email still in this tab.
    await context.setOffline(true);
    await context.setOffline(false);
    await expect(page.getByRole("button", { name: /Pay \$29 \(simulated\)/ })).toBeVisible({ timeout: 15_000 });
  });

  test("a dropped connection while sending the photo offers a retry, without a second charge", async ({ page }) => {
    // Waits for the queue to email the report.
    test.slow();
    let dropped = false;
    await page.route("**/api/fulfill", async (route) => {
      if (dropped) return route.continue();
      dropped = true;
      await route.abort("internetdisconnected");
    });
    await runOnboarding(page);
    await page.getByRole("button", { name: /Pay \$29 \(simulated\)/ }).click();
    await expect(page.getByRole("heading", { name: /We couldn't send your photo/ })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/Your payment is safe/)).toBeVisible();
    // The photo is still in this tab: one tap sends it again.
    await page.getByRole("button", { name: "Try again" }).click();
    await expect(page.getByRole("heading", { name: /Request received/ })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("heading", { name: /Your report is in your email/ })).toBeVisible({ timeout: 60_000 });
  });

  test("back after the request doesn't offer a payment again, and the same tab can buy a second report", async ({ page }) => {
    // Waits for the queue to email the report.
    test.slow();
    await runOnboarding(page);
    await page.getByRole("button", { name: /Pay \$29 \(simulated\)/ }).click();
    await expect(page.getByRole("heading", { name: /Your report is in your email/ })).toBeVisible({ timeout: 60_000 });

    // Back lands on checkout, which sends the buyer back to where their report went.
    await page.goBack();
    await page.waitForURL("**/processing");
    await expect(page.getByRole("heading", { name: /Your report is in your email/ })).toBeVisible();

    // Same tab: a new purchase (the intake again, since email and photo live only in memory) opens a
    // new order, not the paid session.
    await runOnboarding(page);
    await page.getByRole("button", { name: /Pay \$29 \(simulated\)/ }).click();
    await expect(page.getByRole("heading", { name: /Request received/ })).toBeVisible({ timeout: 30_000 });
  });
});
