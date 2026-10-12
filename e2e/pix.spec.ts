import { expect, test, type Page } from "@playwright/test";
import { runOnboarding } from "./support/flow";

const pixCode = (page: Page) => page.getByLabel("Pix Copia e Cola");

test.describe("Pix for visitors in Brazil (simulated)", () => {
  test.use({ timezoneId: "America/Sao_Paulo", locale: "pt-BR" });

  test("shows the price in reais, generates a code, and moves on once it's paid", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("R$ 37,99").first()).toBeVisible();

    await runOnboarding(page);
    await expect(page.getByRole("heading", { name: "Pay with Pix" })).toBeVisible();
    await expect(page.getByText("R$ 37,99").first()).toBeVisible();
    await page.getByRole("button", { name: "Generate Pix code" }).click();

    await expect(page.getByRole("img", { name: "Pix QR code" })).toBeVisible();
    await expect(pixCode(page)).toContainText("br.gov.bcb.pix");
    await expect(page.getByText(/^Valid until/)).toBeVisible();
    await expect(page.getByRole("status")).toContainText("Waiting for your payment");

    await page.getByRole("button", { name: "Simulate Pix payment" }).click();
    await page.waitForURL("**/result", { timeout: 60_000 });
    await expect(page.getByRole("heading", { name: "Your concept and plan" })).toBeVisible();
  });

  test("a reload while paying in the bank app shows the same code, and the page notices the payment by itself", async ({ page }) => {
    await runOnboarding(page);
    await page.getByRole("button", { name: "Generate Pix code" }).click();
    const code = await pixCode(page).textContent();

    await page.reload();
    await expect(pixCode(page)).toHaveText(code!);

    // Paid from the bank app (simulated by calling the dev endpoint, not by clicking here).
    await page.evaluate(() => fetch("/api/dev/mock-pay", { method: "POST", headers: { "content-type": "application/json", "x-mxva-request": "1" }, body: JSON.stringify({ outcome: "succeeded" }) }));
    await page.waitForURL("**/processing", { timeout: 15_000 });
    // The reload dropped the in-memory photo: ask for it again, never for a second payment.
    await expect(page.getByRole("heading", { name: "Add your front photo again" })).toBeVisible();
  });

  test("an expired code says nothing was charged and offers a new one", async ({ page }) => {
    await runOnboarding(page);
    await page.getByRole("button", { name: "Generate Pix code" }).click();
    const first = await pixCode(page).textContent();

    await page.evaluate(() => fetch("/api/dev/mock-pay", { method: "POST", headers: { "content-type": "application/json", "x-mxva-request": "1" }, body: JSON.stringify({ outcome: "expired" }) }));
    await expect(page.getByText("This Pix code expired.")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Nothing was charged.")).toBeVisible();

    await page.getByRole("button", { name: "Generate a new code" }).click();
    await expect(pixCode(page)).not.toHaveText(first!);
  });

  test("card is one tap away", async ({ page }) => {
    await runOnboarding(page);
    await page.getByRole("button", { name: "Pay by card instead" }).click();
    await expect(page.getByRole("button", { name: /Pay \$29 \(simulated\)/ })).toBeVisible();
    await page.getByRole("button", { name: "In Brazil? Pay with Pix" }).click();
    await expect(page.getByRole("button", { name: "Generate Pix code" })).toBeVisible();
  });
});

test.describe("Pix outside Brazil", () => {
  test("card comes first; Pix is offered for people in Brazil", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("$29").first()).toBeVisible();
    await runOnboarding(page);
    await expect(page.getByRole("button", { name: /Pay \$29 \(simulated\)/ })).toBeVisible();
    await page.getByRole("button", { name: "In Brazil? Pay with Pix" }).click();
    await page.getByRole("button", { name: "Generate Pix code" }).click();
    await expect(page.getByRole("img", { name: "Pix QR code" })).toBeVisible();
  });
});
