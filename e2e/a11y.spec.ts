import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { runOnboarding } from "./support/flow";

async function axe(page: Page) {
  // Client navigations apply the new <title> a moment after the content.
  await expect(page).toHaveTitle(/MXVA/);
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const serious = results.violations.filter((violation) => violation.impact === "serious" || violation.impact === "critical");
  expect(serious.map((violation) => `${violation.id}: ${violation.nodes.map((node) => node.target.join(" ")).join(", ")}`)).toEqual([]);
}

test.describe("accessibility (axe, WCAG 2.1 AA)", () => {
  for (const path of ["/", "/start", "/sample-report", "/privacy", "/help"]) {
    test(`no serious violations on ${path}`, async ({ page }) => {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      await axe(page);
    });
  }

  test("no serious violations across the funnel", async ({ page }) => {
    await runOnboarding(page, "goals");
    await axe(page);
    await page.goto("/start");
    await runOnboarding(page, "photos");
    await axe(page);
    await runOnboarding(page);
    await axe(page);
    await page.getByRole("button", { name: /Pay \$29 \(simulated\)/ }).click();
    await page.waitForURL("**/result", { timeout: 60_000 });
    await axe(page);
  });
});

test.describe("responsive", () => {
  for (const width of [320, 375, 768, 1440]) {
    test(`no horizontal scroll at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      for (const path of ["/", "/start", "/sample-report"]) {
        await page.goto(path);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        expect(overflow, `${path} at ${width}px`).toBeLessThanOrEqual(0);
      }
    });
  }
});
