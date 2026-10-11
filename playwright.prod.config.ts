import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PROD_PORT ?? 3200);
const baseURL = `http://localhost:${PORT}`;

// Production build with default (safe) flags: proves no mock payment or mock result
// can be reached when NODE_ENV=production.
export default defineConfig({
  testDir: "./e2e/prod",
  fullyParallel: true,
  reporter: [["list"]],
  use: { baseURL },
  projects: [{ name: "prod-chrome", use: { ...devices["Desktop Chrome"], channel: "chrome" } }],
  webServer: {
    command: `npm run build && npm run start -- --port ${PORT}`,
    url: `${baseURL}/api/health`,
    reuseExistingServer: false,
    timeout: 600_000,
    env: {
      NEXT_PUBLIC_ENABLE_REAL_PAYMENTS: "false",
      NEXT_PUBLIC_ENABLE_REAL_AI: "false",
      NEXT_PUBLIC_SHOW_DEV_PREVIEW: "true",
      NEXT_PUBLIC_APP_URL: baseURL,
    },
  },
});
