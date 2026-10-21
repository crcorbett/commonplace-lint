# Commonplace Lint

106 custom Oxlint rules for TypeScript, Effect and Alchemy, packaged as
`@commonplaces/oxlint-plugin`. Supports Oxlint **1.80.0, 1.85.0 or 1.86.0** and Node
**22.14 or newer**. Licensed under MIT.

## Install

Install the latest published npm version and save the exact resolved version:

```sh
npm install --save-dev --save-exact @commonplaces/oxlint-plugin@latest oxlint@1.80.0
```

The qualified npm `latest` is 0.4.0 with 106 rules and the complete `strict`
profile. See [the publication record](docs/evidence/2026-10-18-npm-040.md)
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

Use Bun 1.4.0 and Node 22.14 or newer:

```sh
bun install --frozen-lockfile
bun run test
bun run verification
bun run pack
```

The build produces ordinary JavaScript and declarations. Tests install the
actual archive in separate projects with all three supported Oxlint versions.

- [Repository boundaries](ARCHITECTURE.md)
- [Documentation](docs/README.md)
- [Release instructions](docs/runbooks/release.md)
- [MIT licence](LICENSE)
