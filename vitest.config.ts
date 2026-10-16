import { defineConfig, defineProject } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      defineProject({
        test: {
          name: "lint-package",
          include: ["packages/oxlint-plugin/test/**/*.test.ts"],
          testTimeout: 60_000,
        },
      }),
      defineProject({
        test: { name: "lint-rules", include: ["tools/oxlint/**/*.test.ts"], testTimeout: 15_000 },
      }),
    ],
  },
});
