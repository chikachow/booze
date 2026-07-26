// oxlint-disable import/no-default-export -- Playwright discovers configuration through the default export.
import { defineConfig } from "@playwright/test";

export default defineConfig({
  expect: { timeout: 5_000 },
  fullyParallel: false,
  outputDir: "/tmp/booze-playwright-results",
  projects: [
    { name: "chrome-light", use: { colorScheme: "light" } },
    { name: "chrome-dark", use: { colorScheme: "dark" } },
  ],
  reporter: "line",
  testDir: "./e2e",
  timeout: 30_000,
  use: {
    baseURL: "http://127.0.0.1:4174",
    channel: "chrome",
    reducedMotion: "reduce",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "VITE_AUTH_MODE=development pnpm dev --host 127.0.0.1 --port 4174",
    reuseExistingServer: false,
    timeout: 120_000,
    url: "http://127.0.0.1:4174/healthz",
  },
  workers: 1,
});
