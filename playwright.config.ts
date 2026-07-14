import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  timeout: 30_000,
  use: { baseURL: "http://localhost:3101" },
  webServer: {
    command: "rm -f .e2e.db && npm run build && npx next start -p 3101",
    url: "http://localhost:3101/health",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: {
      TEST_AUTH_BYPASS: "1",
      DB_PATH: ".e2e.db",
      AUTH_SECRET: "e2e-secret-at-least-32-characters-long!!",
      TZ: "Europe/London",
    },
  },
});
