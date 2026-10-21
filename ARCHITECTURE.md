# Repository boundaries

Commonplace Lint is a public MIT library with one workspace:

```text
root tooling and CI
  └── packages/oxlint-plugin
       ├── src: 106 rules, six configuration groups and optional style
       ├── test: rule behaviour and independent archive consumers
       └── dist: generated JavaScript and declarations

tools/oxlint: real-command fixtures for portable Effect and Alchemy rules
docs: design, repeatable release procedures and dated evidence
```

The package is the only rule implementation owner. Marketplace skills remain
in their separate private repository and install a release. Neither repository
imports the other's source. The public repository contains no private Git
history, marketplace skill material, icons or account credentials.

## Fit with repository and package structure

This is an extraction of an existing publishable library. Apply the shared
repo-structure tooling and ownership rules to that role. The website renderer's
apps, API, domain packages, infrastructure and complete skill distribution are
not applicable: this repository has no application to run or deploy. Private
workflow skill folders are not redistributed into the public library. The root
instructions and local documentation own the small contribution contract.

All eleven package exports point to compiled files, including local workspace
use. There is deliberately no source condition: archive tests must catch
missing build output. Oxlint owns synchronous rule callbacks; pure rules use
immutable Effect collections. Native host syntax and configuration exceptions
are explained in the package README. There are no owned services or Layer
factories in production code.

## Checks

Direct dependency versions were checked against npm's latest releases on
21 October 2026 and pinned exactly. Effect and platform packages use 4.0.5;
Oxlint and its host SDK use 1.89.0; Effect's lint tool uses 0.55.0 with the
supported oxlint-tsgolint 7.0.2004. Bun is 1.4.3 and Oxfmt is 0.74.0.
Upgrading versions requires fresh archive tests with every supported host.
Peer support is exactly Oxlint 1.86.0 or 1.89.0. Ultracite 8 requires at least
1.86, so the older 1.80 and 1.85 hosts are no longer supported.

Effect's native checker uses the `@effect/language-service` configuration name;
`@effect/tsgo` supplies it, so Knip ignores that one virtual dependency name.
Oxlint owns Effect diagnostics; editor diagnostics are disabled to avoid a
second copy. Root tooling is included in its TypeScript project so the native
checker can read its settings. The root reference points to the actual package
build configuration. The root test project allows seven named native APIs and package tests allow
five of them through `allowedUnstableApis`; the instability rule remains active for other
APIs and files. A real-command test proves both limits. The nominal error brand
in the constructor fixture keeps it valid under the latest checker.

`bun run test` builds first, then runs rule and archive consumers.
`bun run verification` checks format, lint, both Knip graphs, TypeScript, build,
workspace ownership and documentation links. Turbo inputs include root config
read by each package task. `bun run pack` cleans and builds the package and
writes a standard npm archive. Only dist, README, package.json and LICENSE are
included. Tests prove accepted and rejected code, exported groups and all 106
registrations outside the workspace.

## Releases

GitHub owns source, tags and optional package archive mirrors. npm distributes
the canonical compiled releases. A GitHub release does not advance the registry
version. The release runbook owns publication and independent archive readback;
a mirror is a separate distribution route.

The release pattern follows Alchemy's own use of GitHub Actions and a package
manager; no Alchemy state or deployment stack is needed for a library release.
The npm workflow is manual and uses short-lived GitHub identity for authorised
publication. No stored npm token or infrastructure deployment is needed.
