import { expect, test } from "@playwright/test";
import { runOnboarding } from "./support/flow";

test.describe("paid funnel (development mocks)", () => {
  test("start to email: 16 steps, simulated payment, the report is queued and emailed", async ({ page }) => {
    // Waits for the queue to email the report.
    test.slow();
    const consoleText: string[] = [];
    page.on("console", (message) => consoleText.push(message.text()));

    await runOnboarding(page);
    await expect(page.getByRole("heading", { name: /Your glow-up is/ })).toBeVisible();
    await expect(page.getByRole("img", { name: "Your photo" })).toBeVisible();
    await expect(page.getByRole("slider", { name: "Compare the example before and after" })).toBeVisible();
    await expect(page.getByText(/\$29/).first()).toBeVisible();
    await page.getByRole("button", { name: /Pay \$29 \(simulated\)/ }).click();

    // Nobody waits for the report: the request is confirmed with an estimate, and the page can be closed.
    await page.waitForURL("**/processing");
    await expect(page.getByRole("heading", { name: /Request received\. Your report arrives by email in about/ })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/You can close this page/)).toBeVisible();
    await expect(page.getByRole("link", { name: "Back to home" })).toHaveAttribute("href", "/");
    // Nothing of the report or the photo is shown in the page.
    await expect(page.getByRole("link", { name: /Download PDF/ })).toHaveCount(0);
    await expect(page.locator('img[src^="blob:"]:visible')).toHaveCount(0);

    // An open page follows the order until the email goes out.
    await expect(page.getByRole("heading", { name: /Your report is in your email/ })).toBeVisible({ timeout: 60_000 });

    // No photo bytes or data URLs ever reach the console.
    expect(consoleText.join("\n")).not.toMatch(/data:image|base64|\/9j\//);
  });

  test("a declined payment changes nothing and can be retried", async ({ page }) => {
    await runOnboarding(page);
    await page.getByRole("button", { name: "Simulate decline" }).click();
    await expect(page.locator('main [role="alert"]')).toContainText("declined");
    await expect(page).toHaveURL(/\/checkout$/);
  });
});
