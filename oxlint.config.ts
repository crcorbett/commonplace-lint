import { recommended as effectRecommended } from "@effect/tsgo/oxlint-presets";
import { general, effect, alchemy } from "@commonplaces/oxlint-plugin";
import { defineConfig } from "oxlint";

export default defineConfig({
  ...effectRecommended,
  extends: [general, effect, alchemy],
  ignorePatterns: ["tools/oxlint/fixtures/**"],
  rules: {
    ...effectRecommended.rules,
    ...effect.rules,
    // The doctor command's host adapter reports failure through the exit code.
    "strict-effect/no-imperative-collections": [
      "error",
      {
        allowedAssignments: [
          { file: "packages/oxlint-plugin/src/doctor/main.ts", target: "process.exitCode" },
        ],
      },
    ],
    "effect/no-runtime-execution-outside-main": "error",
    "max-lines": ["error", { max: 500, skipBlankLines: true, skipComments: true }],
  },
  overrides: [
    {
      // The doctor command's host adapter reads its `--allow-missing` flags from
      // process.argv; it has no Effect runtime to decode command input through.
      files: ["packages/oxlint-plugin/src/doctor/main.ts"],
      rules: { "effect/no-ambient-process": "off" },
    },
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
