import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3100);
const baseURL = `http://localhost:${PORT}`;

// Uses the locally installed Google Chrome. Set E2E_WEBKIT=1 after
// `npx playwright install webkit` to add the iPhone Safari (WebKit) project.
// Runs its own dev server (port 3100, build dir .next-e2e) with simulated payments and AI,
// whatever .env.local says, so it never touches real providers or your dev server on :3000.
export default defineConfig({
  testDir: "./e2e",
  testIgnore: ["prod/**"],
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    // Deterministic region: card first. Brazil-specific tests opt in with test.use().
    timezoneId: "America/New_York",
    locale: "en-US",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "android-chrome", use: { ...devices["Pixel 7"], channel: "chrome" } },
    { name: "desktop-chrome", use: { ...devices["Desktop Chrome"], channel: "chrome" } },
    ...(process.env.E2E_WEBKIT ? [{ name: "iphone-safari", use: { ...devices["iPhone 15"] } }] : []),
  ],
  webServer: {
    command: `npm run dev -- --port ${PORT}`,
    url: `${baseURL}/api/health`,
    env: {
      NEXT_DIST_DIR: ".next-e2e",
      NEXT_PUBLIC_APP_URL: baseURL,
      NEXT_PUBLIC_ENABLE_REAL_PAYMENTS: "false",
      NEXT_PUBLIC_ENABLE_REAL_AI: "false",
      NEXT_PUBLIC_SHOW_DEV_PREVIEW: "true",
      DATABASE_URL: "",
    },
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
