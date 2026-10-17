# Commonplace Lint

61 custom Oxlint rules for TypeScript, Effect and Alchemy, packaged as
`@commonplaces/oxlint-plugin`. Supports Oxlint **1.80.0, 1.85.0 or 1.86.0** and Node
**22.14 or newer**. Licensed under MIT.

## Install

Install the checked GitHub release archive:

```sh
npm install --save-dev --save-exact https://github.com/crcorbett/commonplace-lint/releases/download/v0.3.0/commonplaces-oxlint-plugin-0.3.0.tgz oxlint@1.80.0
```

The npm registry currently provides `@commonplaces/oxlint-plugin@0.1.2` (57 rules).
The 0.3.0 additions below require the GitHub archive until a separate npm release
is published. GitHub archive publication does not publish a registry version.

The earlier GitHub release v0.1.0 uses the old `@commonplace/oxlint-plugin`
name. Its archive remains unchanged; move imports to `@commonplaces/oxlint-plugin`
when upgrading.
See [package usage](packages/oxlint-plugin/README.md) for the `general`, `effect`
and `alchemy` groups, individual rules and project settings.

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
