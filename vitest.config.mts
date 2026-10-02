import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/unit/**/*.test.ts"],
    environment: "node",
    testTimeout: 60000,
    hookTimeout: 600000,
    globalSetup: ["test/global-setup.ts"],
  },
});
