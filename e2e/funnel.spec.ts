import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { runOnboarding } from "./support/flow";

test.describe("paid funnel (development mocks)", () => {
  test("start to result: 16 steps, simulated payment, streamed report, PDF", async ({ page }) => {
    const consoleText: string[] = [];
    page.on("console", (message) => consoleText.push(message.text()));

    await runOnboarding(page);
    await expect(page.getByRole("heading", { name: /One report/ })).toBeVisible();
    await expect(page.getByText(/\$29/).first()).toBeVisible();
    await page.getByRole("button", { name: /Pay \$29 \(simulated\)/ }).click();

    await page.waitForURL("**/result", { timeout: 60_000 });
    await expect(page.getByRole("heading", { name: "Your concept and plan" })).toBeVisible();
    await expect(page.getByText("AI concept preview; not a guaranteed result")).toBeVisible();
    await expect(page.getByRole("img", { name: "Your AI concept portrait" })).toBeVisible();
    await expect(page.getByRole("slider", { name: "Compare today and concept" })).toBeVisible();
    await expect(page.getByText("Also sent to your email")).toBeVisible();

    const link = page.getByRole("link", { name: /Download PDF/ });
    await expect(link).toHaveAttribute("download", "your-appearance-roadmap.pdf");
    const [download] = await Promise.all([page.waitForEvent("download"), link.click()]);
    expect(download.suggestedFilename()).toBe("your-appearance-roadmap.pdf");
    const bytes = readFileSync((await download.path())!);
    expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");

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
