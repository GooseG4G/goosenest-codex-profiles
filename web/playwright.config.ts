import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  outputDir: "../../output/playwright/test-results",
  timeout: 15_000,
  use: { baseURL: "http://127.0.0.1:8080", trace: "retain-on-failure" },
  webServer: {
    command: "npm run dev -- --host 127.0.0.1",
    url: "http://127.0.0.1:8080",
    reuseExistingServer: true,
  },
  projects: [
    {
      name: "mobile",
      testMatch: /mobile-nav\.spec\.ts/,
      use: { ...devices["Pixel 5"] },
    },
    {
      name: "desktop",
      testMatch: /desktop-interactions\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
