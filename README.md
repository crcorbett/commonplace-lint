# Commonplace Lint

57 custom Oxlint rules for TypeScript, Effect and Alchemy, published as
`@commonplace/oxlint-plugin`. Supports Oxlint **1.80.0 or 1.85.0** and Node
**22.14 or newer**. Licensed under MIT.

## Install

Until npm publication, install the compiled archive from the GitHub release:

```sh
npm install --save-dev --save-exact https://github.com/crcorbett/commonplace-lint/releases/download/v0.1.0/commonplace-oxlint-plugin-0.1.0.tgz oxlint@1.80.0
```

The archive uses the same package name and exports as the future npm package.
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
actual archive in separate projects with both supported Oxlint versions.

- [Repository boundaries](ARCHITECTURE.md)
- [Documentation](docs/README.md)
- [Release instructions](docs/runbooks/release.md)
- [MIT licence](LICENSE)
