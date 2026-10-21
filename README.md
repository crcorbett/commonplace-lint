# Commonplace Lint

106 custom Oxlint rules for TypeScript, Effect and Alchemy, packaged as
`@commonplaces/oxlint-plugin`. Supports Oxlint **1.86.0 or 1.89.0** and Node
**22.14 or newer**. Licensed under MIT.

## Install

Install version 0.5.0 and save the exact version:

```sh
npm install --save-dev --save-exact @commonplaces/oxlint-plugin@0.5.0 oxlint@1.89.0
```

Version 0.5.0 adds the optional style preset and the host requirements above.
Published 0.4.0 keeps its earlier host list. Consumer adoption is a separate step.

The qualified npm `latest` is 0.5.0 with 106 rules, the complete `strict`
profile and the separate optional `style` preset. See [the publication record](docs/evidence/2026-10-21-npm-050.md)
for the reviewed source, canonical registry archive, provenance and independent
checks. npm installation does not depend on a GitHub archive mirror.

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
actual archive in separate projects with both supported Oxlint versions.

- [Repository boundaries](ARCHITECTURE.md)
- [Documentation](docs/README.md)
- [Release instructions](docs/runbooks/release.md)
- [MIT licence](LICENSE)
