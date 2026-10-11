import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3000);
const baseURL = `http://localhost:${PORT}`;

// Uses the locally installed Google Chrome. Set E2E_WEBKIT=1 after
// `npx playwright install webkit` to add the iPhone Safari (WebKit) project.
export default defineConfig({
  testDir: "./e2e",
  testIgnore: ["prod/**"],
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
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
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
