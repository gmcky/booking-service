import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/tests/integration/**/*.test.ts"],
    setupFiles: ["./src/tests/setup.integration.ts"],
    testTimeout: 120000,
    hookTimeout: 120000,
  },
});
