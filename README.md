# Commonplace Lint

61 custom Oxlint rules for TypeScript, Effect and Alchemy, packaged as
`@commonplaces/oxlint-plugin`. Supports Oxlint **1.80.0, 1.85.0 or 1.86.0** and Node
**22.14 or newer**. Licensed under MIT.

## Install

Install the current published npm version (57 rules):

```sh
npm install --save-dev --save-exact @commonplaces/oxlint-plugin@0.1.2 oxlint@1.80.0
```

Version 0.3.0 contains the 61 rules described in this source tree. Its checked
tag and local archive are ready; release asset upload and npm publication are
pending. The new rules are not yet available through the installation command
above. See [the qualification record](docs/evidence/2026-10-17-prevention-rules.md)
for the checks and publication status. GitHub archive publication does not
publish a registry version.

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
