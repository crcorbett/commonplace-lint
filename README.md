# Commonplace Lint

107 custom Oxlint rules for TypeScript, Effect and Alchemy, packaged as
`@commonplaces/oxlint-plugin`. Version 0.6.1 supports Oxlint **1.87.0, 1.88.0 or 1.89.0** and Node
**22.14 or newer**. Licensed under MIT.

Version 0.6.0 adds all 26 native Effect correctness checks as errors and an
immutable accumulation check. The optional style preset allows strict Effect
patterns without asking for forbidden async functions, loops or mutation.

## Install

Install version 0.6.1 and save the exact version:

```sh
npm install --save-dev --save-exact @commonplaces/oxlint-plugin@0.6.1 \
  @effect/tsgo@0.55.0 oxlint@1.89.0 oxlint-tsgolint@7.0.2004 typescript@7.0.2
```

Add `effect-tsgo patch --oxlint` to the consuming project's root `prepare`
script so dependency installation prepares both TypeScript and Oxlint
automatically. Preserve existing hooks and build tasks in that script. See
[native Effect setup](packages/oxlint-plugin/README.md#native-effect-correctness)
for the complete setup and supported compiler versions. Consumer adoption is a
separate step.

The verified npm `latest` is 0.6.1. See [the publication record](docs/evidence/2026-10-22-npm-061.md)
for the local publication, matching archive and fresh consumer checks.
The [0.6.0 record](docs/evidence/2026-10-22-npm-060.md) preserves the earlier
trusted publishing and provenance checks. npm installation does not depend on a GitHub archive mirror.

The earlier GitHub release v0.1.0 uses the old `@commonplace/oxlint-plugin`
name. Its archive remains unchanged; move imports to `@commonplaces/oxlint-plugin`
when upgrading.
See [package usage](packages/oxlint-plugin/README.md) for all six configuration groups, the optional `style` preset, the `strict` composition, individual rules
and project settings.

## Optional style checks

`style` restores Ultracite's core, React and Vitest checks with the shared
Common Practice and Site overrides. It is separate from `strict`:

```ts
import { style, strict } from "@commonplaces/oxlint-plugin";
import { defineConfig } from "oxlint";
import project from "./tools/oxlint/project.config.ts";

export default defineConfig({ extends: [style, strict, project] });
```

Keep that order so the strict safety settings win. Use `oxlint --type-aware
--deny-warnings .` for the complete checks. See [package usage](packages/oxlint-plugin/README.md#optional-style-preset)
for the pinned version, all overrides and supported-host adjustments.

## Develop

Use Bun 1.4.3 and Node 24.15 or newer for the current npm 12 tooling:

```sh
bun install --frozen-lockfile
bun run test
bun run verification
bun run pack
```

The build produces ordinary JavaScript and declarations. Tests install the
actual archive in separate projects with every supported Oxlint version.

- [Repository boundaries](ARCHITECTURE.md)
- [Documentation](docs/README.md)
- [Release instructions](docs/runbooks/release.md)
- [MIT licence](LICENSE)
