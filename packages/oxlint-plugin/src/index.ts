import type { OxlintConfig } from "oxlint";
import { correctness } from "@effect/tsgo/oxlint-presets";
import { Record } from "effect";
import conventionPlugin from "./conventions.js";
import webPlugin from "./web.js";

/** General code checks, with no project-specific file names or settings. */
export const general = {
  jsPlugins: ["@commonplaces/oxlint-plugin/anti-slop", "@commonplaces/oxlint-plugin/package"],
  rules: {
    "anti-slop/no-chained-type-assertions": "error",
    "anti-slop/no-conditional-empty-object-spread": "error",
    "anti-slop/no-known-value-widening": "error",
    "anti-slop/no-module-mocking": "error",
    "anti-slop/no-object-parameters": "error",
    "anti-slop/no-reflect-apply": "error",
    "anti-slop/no-reflect-get": "error",
    "anti-slop/no-runtime-typeof": "error",
    "anti-slop/no-shape-in-symbol-names": "error",
    "anti-slop/no-unknown-parameters": "error",
    "anti-slop/no-unknown-returns": "error",
    "anti-slop/no-unknown-type-aliases": "error",
    "anti-slop/no-unsafe-dictionary-type": "error",
    "anti-slop/no-widen-then-assert": "error",
    "anti-slop/require-safety-comment-for-type-assertion": "error",
    "package/no-cross-package-source-imports": "error",
  },
} satisfies OxlintConfig;

/** Effect code checks. Add the general group separately if wanted. */
export const effect: OxlintConfig = {
  ...correctness,
  jsPlugins: [
    "@commonplaces/oxlint-plugin/effect",
    "@commonplaces/oxlint-plugin/strict-effect",
    "@commonplaces/oxlint-plugin/bun",
    "@commonplaces/oxlint-plugin/anti-slop-effect",
  ],
  rules: {
    ...Record.map(correctness.rules ?? {}, () => "error" as const),
    "effect/no-ambient-process": "error",
    "effect/no-async-await-promise": "error",
    "effect/no-console": "error",
    "effect/no-instanceof": "error",
    "effect/no-manual-tag": "error",
    "effect/no-raw-fetch": "error",
    "effect/require-service-operation-instrumentation": "error",
    "strict-effect/static-layers": "error",
    "strict-effect/subprocess-pipe-capture": "error",
    "strict-effect/http-client-error-classification": "error",
    "strict-effect/no-runtime-type-assertions": "error",
    "strict-effect/no-unchecked-index": "error",
    "strict-effect/no-native-at": "error",
    "strict-effect/tagged-error-name": "error",
    "strict-effect/error-constructor-new": "error",
    "strict-effect/no-promise-workflow": "error",
    "strict-effect/no-unsafe-option-unwrap": "error",
    "strict-effect/no-unchecked-json": "error",
    "strict-effect/no-native-work": "error",
    "strict-effect/no-imperative-collections": "error",
    "strict-effect/no-copying-accumulator": "error",
    "strict-effect/no-native-client-replica": "error",
    "bun/no-ambient-host-api": "error",
    "anti-slop-effect/no-service-constructor-imports": "error",
  },
} satisfies OxlintConfig;

/** Optional strict coding conventions; boundary permissions remain project facts. */
export const conventions = {
  jsPlugins: ["@commonplaces/oxlint-plugin/conventions"],
  rules: Record.mapKeys(
    Record.map(
      Record.filter(
        conventionPlugin.rules,
        (_, name) =>
          name !== "no-schema-decoder-outside-ingress" &&
          name !== "no-schema-encoder-outside-egress" &&
          name !== "no-sync-decoder-outside-consumer" &&
          name !== "browser-runtime-ownership" &&
          name !== "native-http-client-ownership" &&
          name !== "bounded-build-memo",
      ),
      () => "error" as const,
    ),
    (name) => `effect-conventions/${name}`,
  ),
} satisfies OxlintConfig;

/** Optional React/TanStack, MDX, semantic typography and route conventions. */
export const web = {
  plugins: ["react", "react-perf", "jsx-a11y"],
  jsPlugins: ["@commonplaces/oxlint-plugin/web"],
  rules: Record.mapKeys(
    Record.map(webPlugin.rules, () => "error" as const),
    (name) => `web/${name}`,
  ),
} satisfies OxlintConfig;

/** Native type-aware checks. Run Oxlint with --type-aware. */
export const typescript = {
  plugins: ["typescript", "unicorn", "import", "vitest"],
  categories: { correctness: "error" },
  rules: {
    "no-ternary": "error",
    "typescript/consistent-type-assertions": ["error", { assertionStyle: "never" }],
    "typescript/no-explicit-any": "error",
    "typescript/no-non-null-assertion": "error",
    "typescript/await-thenable": "error",
    "typescript/no-floating-promises": "error",
    "typescript/no-misused-promises": "error",
    "typescript/no-unsafe-argument": "error",
    "typescript/no-unsafe-assignment": "error",
    "typescript/no-unsafe-call": "error",
    "typescript/no-unsafe-member-access": "error",
    "typescript/no-unsafe-return": "error",
    "typescript/no-unsafe-type-assertion": "error",
  },
} satisfies OxlintConfig;

/** Native Alchemy configuration and secret-source checks. */
export const alchemy = {
  jsPlugins: ["@commonplaces/oxlint-plugin/alchemy", "@commonplaces/oxlint-plugin/strict-effect"],
  rules: {
    "alchemy-secrets/native-sources": "error",
    "alchemy-secrets/explicit-stack-sources": "error",
    "alchemy-secrets/no-doppler-wrapper": "error",
    "strict-effect/native-cloudflare-cache": "error",
  },
} satisfies OxlintConfig;

/** Complete strict Effect application profile; exact project owners stay local. */
export const strict = {
  extends: [general, effect, alchemy, conventions, web, typescript],
} satisfies OxlintConfig;

export { default as style } from "./style.js";
