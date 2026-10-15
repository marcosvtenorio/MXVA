import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { runOnboarding, showPixQr } from "./support/flow";

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
    test.slow();
    await runOnboarding(page, "photos");
    await axe(page);
    await page.goto("/start");
    await runOnboarding(page, "constraints");
    await axe(page);
    // The photo step with a photo in (its file inputs lose their visible labels) and the review list.
    await page.goBack();
    await page.waitForURL("**/onboarding/photos");
    await axe(page);
    await runOnboarding(page, "review");
    await axe(page);
    await runOnboarding(page);
    await axe(page);
    await page.getByRole("button", { name: /Pay \$29 \(simulated\)/ }).click();
    await expect(page.getByRole("heading", { name: /Request received/ })).toBeVisible({ timeout: 30_000 });
    await axe(page);
    await expect(page.getByRole("heading", { name: /Your report is in your email/ })).toBeVisible({ timeout: 60_000 });
    await axe(page);
  });
});

test.describe("accessibility of Pix checkout (Brazil)", () => {
  test.use({ timezoneId: "America/Sao_Paulo", locale: "pt-BR" });

  test("no serious violations with an open Pix code, and no horizontal scroll at 320px", async ({ page }) => {
    await runOnboarding(page);
    await axe(page);
    await page.getByRole("button", { name: "Pay R$ 47,99 with Pix" }).click();
    await showPixQr(page);
    await axe(page);
    await page.setViewportSize({ width: 320, height: 800 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
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
