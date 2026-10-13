import { expect, test } from "@playwright/test";
import { runOnboarding } from "./support/flow";

// One browser, several tabs: they share the order session, so they must share one checkout.
test.describe("several tabs", () => {
  test("two tabs share one checkout, and paying in one moves the other along", async ({ context }) => {
    const first = await context.newPage();
    await runOnboarding(first);
    const second = await context.newPage();
    await runOnboarding(second);

    await first.bringToFront();
    await first.getByRole("button", { name: /Pay \$29 \(simulated\)/ }).click();
    // The tab that took the payment makes the report (the other tab never takes it over).
    await first.waitForURL("**/result", { timeout: 60_000 });
    await expect(first.getByRole("heading", { name: "Your concept and plan" })).toBeVisible();

    // The other tab notices on its own and never asks for a second payment.
    await second.bringToFront();
    await second.waitForURL("**/processing", { timeout: 20_000 });
    await expect(second.getByRole("heading", { name: /Your report is (being made|in your email)/ })).toBeVisible({ timeout: 30_000 });
    await expect(second.getByRole("heading", { name: /Your report is in your email/ })).toBeVisible({ timeout: 30_000 });
  });
});
