# Repository boundaries

Commonplace Lint is a public MIT library with one workspace:

```text
root tooling and CI
  └── packages/oxlint-plugin
       ├── src: 59 rules and three configuration groups
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

All eight package exports point to compiled files, including local workspace
use. There is deliberately no source condition: archive tests must catch
missing build output. Oxlint owns synchronous rule callbacks; pure rules use
immutable Effect collections. Native host syntax and configuration exceptions
are explained in the package README. There are no owned services or Layer
factories in production code.

## Checks

Bun 1.4.0 and exact dependency versions come from the existing qualified
implementation, not a claim that they are the newest registry versions. Effect
and platform dependencies remain on 4.0.2. Upgrading versions requires fresh
archive tests with every supported Oxlint host. The host SDK remains 1.80.0;
peer support is exactly 1.80.0, 1.85.0 or 1.86.0.

`bun run test` builds first, then runs rule and archive consumers.
`bun run verification` checks format, lint, both Knip graphs, TypeScript, build,
workspace ownership and documentation links. Turbo inputs include root config
read by each package task. `bun run pack` cleans and builds the package and
writes a standard npm archive. Only dist, README, package.json and LICENSE are
included. Tests prove accepted and rejected code, exported groups and all 59
registrations outside the workspace.

## Releases

GitHub owns source, tags and downloadable package archives. npm will be an
additional distribution channel after account and scope setup. Release commands
are in the runbook. Both channels distribute the same compiled package.

The release pattern follows Alchemy's own use of GitHub Actions and a package
manager; no Alchemy state or deployment stack is needed for a library release.
The npm workflow is manual and stays unused until publication is authorised.
