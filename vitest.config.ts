import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Make describe/it/expect available globally without imports
    globals: true,
    // Use node environment (no DOM) — appropriate for REST API testing
    environment: "node",
    // Load .env before tests run
    setupFiles: ["./tests/setup.ts"],
    // Timeout per test (ms) — REST calls can be slow
    testTimeout: 15_000,
    // Show individual test results
    reporters: ["verbose"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.d.ts"],
    },
  },
});
