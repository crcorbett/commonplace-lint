import { recommended as effectRecommended } from "@effect/tsgo/oxlint-presets";
import { general, effect, alchemy } from "@commonplaces/oxlint-plugin";
import { defineConfig } from "oxlint";

export default defineConfig({
  ...effectRecommended,
  extends: [general, effect, alchemy],
  ignorePatterns: ["tools/oxlint/fixtures/**"],
  rules: {
    ...effectRecommended.rules,
    "strict-effect/no-imperative-collections": "error",
    "effect/no-runtime-execution-outside-main": "error",
    "max-lines": ["error", { max: 500, skipBlankLines: true, skipComments: true }],
  },
  overrides: [
    {
      // These two migrated rule collections remain whole to preserve their shared syntax analysis.
      files: [
        "packages/oxlint-plugin/src/strict-effect.ts",
        "packages/oxlint-plugin/src/alchemy.ts",
      ],
      rules: { "max-lines": "off" },
    },
  ],
});
