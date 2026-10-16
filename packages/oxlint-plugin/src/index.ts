import type { OxlintConfig } from "oxlint";

/** General code checks, with no project-specific file names or settings. */
export const general = {
  jsPlugins: ["@commonplace/oxlint-plugin/anti-slop", "@commonplace/oxlint-plugin/package"],
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
export const effect = {
  jsPlugins: [
    "@commonplace/oxlint-plugin/effect",
    "@commonplace/oxlint-plugin/strict-effect",
    "@commonplace/oxlint-plugin/bun",
    "@commonplace/oxlint-plugin/anti-slop-effect",
  ],
  rules: {
    "effect/no-ambient-process": "error",
    "effect/no-async-await-promise": "error",
    "effect/no-console": "error",
    "effect/no-instanceof": "error",
    "effect/no-manual-tag": "error",
    "effect/no-raw-fetch": "error",
    "strict-effect/static-layers": "error",
    "strict-effect/no-unchecked-index": "error",
    "strict-effect/no-native-at": "error",
    "strict-effect/tagged-error-name": "error",
    "strict-effect/error-constructor-new": "error",
    "strict-effect/no-promise-workflow": "error",
    "strict-effect/no-unsafe-option-unwrap": "error",
    "strict-effect/no-unchecked-json": "error",
    "strict-effect/no-native-work": "error",
    "strict-effect/no-imperative-collections": "error",
    "strict-effect/no-native-client-replica": "error",
    "bun/no-ambient-host-api": "error",
    "anti-slop-effect/no-service-constructor-imports": "error",
  },
} satisfies OxlintConfig;

/** Native Alchemy configuration and secret-source checks. */
export const alchemy = {
  jsPlugins: ["@commonplace/oxlint-plugin/alchemy", "@commonplace/oxlint-plugin/strict-effect"],
  rules: {
    "alchemy-secrets/native-sources": "error",
    "alchemy-secrets/explicit-stack-sources": "error",
    "alchemy-secrets/no-doppler-wrapper": "error",
    "strict-effect/native-cloudflare-cache": "error",
  },
} satisfies OxlintConfig;
