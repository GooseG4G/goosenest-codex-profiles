import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 15_000,
  use: { baseURL: "http://127.0.0.1:8080", trace: "retain-on-failure" },
  webServer: {
    command: "npm run dev -- --host 127.0.0.1",
    url: "http://127.0.0.1:8080",
    reuseExistingServer: true,
  },
  projects: [{ name: "mobile", use: { ...devices["Pixel 5"] } }],
});
