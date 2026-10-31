# Repository instructions

Use plain Australian English. This public MIT repository owns one package:
`packages/oxlint-plugin`. Root tooling owns Bun, Turbo, TypeScript, Oxlint,
Oxfmt, Vitest, Knip, Changesets and CI. There is no application runtime or
infrastructure stack. Follow [ARCHITECTURE.md](ARCHITECTURE.md) and
[the documentation router](docs/README.md).

Keep all 109 rule implementations here. Consumers install compiled releases;
do not copy rules into marketplace skills or other projects. Export explicit
package subpaths. Use the same compiled exports locally and in archives.

Use Schema for external input and typed expected failures. Pure checks use
immutable Effect collections. Effect tests compose native service Layers.
Oxlint owns synchronous callbacks, reporting and its parsed syntax tree; the
package must not add an Effect runtime. Document any host adapter exception in
the package README. Do not introduce services or Layers without a real need.

Keep dependencies pinned. Run `bun run test` and `bun run verification` before
committing completed work. Inspect and install the actual archive before
release. Follow [the release runbook](docs/runbooks/release.md). GitHub release
authority does not authorise npm publication. Never commit credentials.
