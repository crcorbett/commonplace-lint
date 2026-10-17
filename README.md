# Commonplace Lint

59 custom Oxlint rules for TypeScript, Effect and Alchemy, packaged as
`@commonplaces/oxlint-plugin`. Supports Oxlint **1.80.0, 1.85.0 or 1.86.0** and Node
**22.14 or newer**. Licensed under MIT.

## Install

Install from npm:

```sh
npm install --save-dev --save-exact @commonplaces/oxlint-plugin@0.2.0 oxlint@1.80.0
```

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
