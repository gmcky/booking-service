import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/tests/unit/**/*.test.ts"],
    setupFiles: ["./src/tests/setup.ts"],
    coverage: {
      provider: "v8",
      include: ["src/modules/**/*.service.ts", "src/modules/**/*.helpers.ts"],
    },
  },
});
