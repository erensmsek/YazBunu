import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "test/e2e",
  timeout: 120_000,
  workers: 1,
  reporter: [["list"]],
  use: { trace: "retain-on-failure" },
});
