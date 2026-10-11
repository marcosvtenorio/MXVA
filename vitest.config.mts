import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    tsconfigPaths: true,
    alias: {
      // `server-only` throws outside the React Server bundle; unit tests import server modules directly.
      "server-only": fileURLToPath(new URL("./src/__tests__/support/empty-module.ts", import.meta.url)),
    },
  },
  test: {
    // Node by default; DOM tests opt in with `// @vitest-environment jsdom`.
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["./src/__tests__/support/setup.ts"],
    restoreMocks: true,
    unstubEnvs: true,
    // Development-like defaults: mocks allowed, real providers off.
    env: {
      NEXT_PUBLIC_APP_URL: "http://localhost:3000",
      NEXT_PUBLIC_ENABLE_REAL_PAYMENTS: "false",
      NEXT_PUBLIC_ENABLE_REAL_AI: "false",
      NEXT_PUBLIC_SHOW_DEV_PREVIEW: "true",
      COOKIE_SIGNING_SECRET: "test-secret-test-secret-test-secret-0123456789",
      PRICE_USD_CENTS: "2900",
      PRICE_VARIANT: "usd_29",
    },
  },
});
