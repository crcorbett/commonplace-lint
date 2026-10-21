import type { OxlintConfig } from "oxlint";
import { Array, Record } from "effect";
import core from "ultracite/oxlint/core";
import react from "ultracite/oxlint/react";
import vitest from "ultracite/oxlint/vitest";

/** Optional shared style checks. Extend before strict and the project policy. */
const style: OxlintConfig = {
  extends: [
    core,
    {
      ...react,
      // Leave these correctness rules to the host category settings. Explicit
      // upstream "off" values would beat strict's correctness category.
      rules: Record.filter(
        react.rules ?? {},
        (_, name) => name !== "jsx-a11y/no-autofocus" && name !== "react/forward-ref-uses-ref",
      ),
    },
    {
      ...vitest,
      // Keep the host's correctness check for test titles in test files too.
      overrides: Array.map(vitest.overrides ?? [], (override) => ({
        ...override,
        rules: Record.filter(override.rules ?? {}, (_, name) => name !== "vitest/valid-title"),
      })),
    },
  ],
  rules: {
    "unicorn/no-array-for-each": "off",
    "unicorn/no-array-sort": "off",
    "unicorn/throw-new-error": "off",
    "no-redeclare": "off",
    "react/function-component-definition": "off",
    "sort-keys": "off",
    "func-names": "off",
    "func-style": "off",
    "no-use-before-define": "off",
    "no-inline-comments": "off",
    "typescript/consistent-return": "off",
  },
} satisfies OxlintConfig;

export default style;
