// Web Judge config for MXVA (skill: ~/.claude/skills/web-judge).
// Walks the real buyer path on a local server with simulated payments and AI:
// nothing reaches OpenAI, Stripe, AbacatePay or Resend. Start the server first:
//
//   NEXT_DIST_DIR=.next-judge NEXT_PUBLIC_APP_URL=http://localhost:3400 NEXT_PUBLIC_ENABLE_REAL_PAYMENTS=false \
//   NEXT_PUBLIC_ENABLE_REAL_AI=false NEXT_PUBLIC_SHOW_DEV_PREVIEW=true DATABASE_URL= npm run dev -- --port 3400
//
// then:  node ~/.claude/skills/web-judge/scripts/judge.mjs design/judge/judge.config.mjs --out design/judge/shots/r1
const button = (page, name) => page.getByRole("button", { name, exact: true }).click();
// The simulated-payment panel exists only in development builds: never judged (it is still in the shots).
const skipDevPreview = (page) =>
  page.evaluate(() => {
    for (const s of document.querySelectorAll("span.mono")) if (/^(Development preview|Sandbox)$/.test(s.textContent.trim())) s.closest("div.grid")?.setAttribute("data-judge-ignore", "");
  });

export default {
  name: "MXVA",
  baseURL: "http://localhost:3400",
  widths: [390, 768, 1440],
  // Most buyers arrive from Instagram in Brazil: Pix is the default way to pay there.
  context: { timezoneId: "America/Sao_Paulo", locale: "pt-BR" },
  phoneUserAgent:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 390.0.0.28.85 (iPhone16,2; iOS 18_5; pt_BR; pt; scale=3.00; 1179x2556)",
  ctaIgnore: "[aria-label='Cookie choices']",
  dark: { widths: [390], pages: ["landing", "photos-added", "checkout", "delivered"] },
  pages: [
    // First visit, cookie choice still open.
    { name: "landing", path: "/", cta: "Start" },
    { name: "consent", capture: false, act: (page) => button(page, "Only necessary") },
    { name: "sample-report", path: "/sample-report" },
    { name: "help", path: "/help" },
    { name: "privacy", path: "/privacy" },
    // The funnel, as a buyer walks it.
    { name: "start", path: "/start", cta: "Start" },
    { name: "photo-guide", act: (page) => button(page, "Start"), waitFor: "**/onboarding/photo-guide" },
    { name: "photos", act: (page) => button(page, "Got it"), waitFor: "**/onboarding/photos" },
    {
      name: "photos-added",
      act: async (page, { fixture }) => {
        // The library input (the second file input) of the front slot.
        await page.locator('input[type="file"]').nth(1).setInputFiles(fixture("../../e2e/fixtures/synthetic-front.jpg"));
        await page.getByAltText("Your front photo").waitFor({ timeout: 20000 });
        await page.getByText("These are photos of me").click();
      },
    },
    { name: "constraints", act: (page) => button(page, "Use these photos"), waitFor: "**/onboarding/constraints" },
    { name: "delivery", act: (page) => button(page, "Continue"), waitFor: "**/onboarding/delivery" },
    {
      name: "review",
      act: async (page) => {
        await page.locator("#email").fill("judge.buyer@example.com");
        await page.getByRole("checkbox", { name: /photos are sent/ }).check();
        await page.getByRole("checkbox", { name: /accept the Terms/ }).check();
        await button(page, "Continue");
      },
      waitFor: "**/onboarding/review",
    },
    {
      name: "checkout",
      act: async (page) => {
        await button(page, "Continue to checkout");
        await page.waitForURL("**/checkout");
        await page.getByRole("button", { name: /Pay R\$ 47,99 with Pix/ }).waitFor();
        await skipDevPreview(page);
      },
    },
    {
      name: "pix-code",
      act: async (page) => {
        await page.getByRole("button", { name: /Pay R\$ 47,99 with Pix/ }).click();
        await page.getByRole("button", { name: "Copy Pix code" }).waitFor();
        await skipDevPreview(page);
      },
    },
    {
      name: "processing",
      act: async (page) => {
        await button(page, "Simulate Pix payment");
        await page.waitForURL("**/processing", { timeout: 60000 });
        await page.getByRole("heading", { name: /Request received/ }).waitFor({ timeout: 30000 });
      },
    },
    {
      name: "delivered",
      act: (page) => page.getByRole("heading", { name: /Your report is in your email/ }).waitFor({ timeout: 90000 }),
    },
  ],
};
