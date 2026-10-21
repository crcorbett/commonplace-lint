import { expect, it } from "@effect/vitest";
import {
  general,
  effect,
  alchemy,
  conventions,
  web,
  typescript,
  strict,
  style,
} from "@commonplaces/oxlint-plugin";
import styleSubpath from "@commonplaces/oxlint-plugin/style";
import { Array, Record } from "effect";
import core from "ultracite/oxlint/core";
import react from "ultracite/oxlint/react";
import vitest from "ultracite/oxlint/vitest";

it("composes exactly the upstream presets and the eleven shared overrides", () => {
  expect(styleSubpath).toBe(style);
  expect(style).toEqual({
    extends: [
      core,
      {
        ...react,
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
  });
});

it("keeps strict separate and preserves every strict setting", () => {
  expect(strict).toEqual({ extends: [general, effect, alchemy, conventions, web, typescript] });
  expect(strict).toMatchSnapshot();
});
