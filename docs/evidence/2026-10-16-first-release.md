# Commonplace Lint 0.1.0 — 16 October 2026

Status: released on public GitHub from a workstation. npm publication is deferred.
Cooper authorised the public repository, the `@commonplace/oxlint-plugin` name,
MIT licensing, pull request merge and local release.

## Source and checks

[PR #1](https://github.com/crcorbett/commonplace-lint/pull/1) merged as
`66b66ae4e8682c056611730fed77f44e6bff8e4d`. The public repository contains the
57 lint rules and their tests, with no private marketplace history or skills.
A fresh independent review found and checked a correction to 18 syntax-node
and variable comparisons: cycle checks now use reference identity rather than
structural equality over the host's syntax graph.

[GitHub verification](https://github.com/crcorbett/commonplace-lint/actions/runs/38886180700)
passed on the PR. A clean detached worktree at the merge commit passed:

- `bun install --frozen-lockfile` with Bun 1.4.0, Node 25.8.2 and npm 11.11.1;
- `bun run test`: 64 tests in 12 files;
- `bun run verification`: lint, formatting, both Knip graphs, types, build and
  one package/eight exports/seven documentation owners;
- `bun run pack`: 59 archive members, limited to compiled output, package
  metadata, README and MIT licence.

Archive tests installed separate consumers with Oxlint 1.80.0 and 1.85.0,
loaded all exports, compiled a TypeScript consumer and checked valid/invalid
code plus a large syntax graph under a 20-second limit.

## Release and public installation

[GitHub release v0.1.0](https://github.com/crcorbett/commonplace-lint/releases/tag/v0.1.0)
is neither a draft nor a prerelease. Its tag and `main` both pointed to the
merge commit when released. The asset is 47,960 bytes:

`commonplace-oxlint-plugin-0.1.0.tgz`

SHA-256:
`cfd4b2e61990a2443ab5c8976006e18c0eb29ff15c58e96b96efe2819464cd7f`

An unauthenticated HTTP download matched that checksum, which also matched
GitHub's asset digest and the attached SHA256SUMS. A new npm consumer installed
the public URL with scripts disabled and Oxlint 1.80.0. Linting the valid
Effect example exited 0 without diagnostics. The invalid example exited 1
with `no-unknown-parameters`, `no-unknown-returns` and `no-console` findings.

## Not claimed

No npm account, scope ownership, trusted publisher or npm publication was set
up. No npm workflow was started. There is no infrastructure stack or provider
deployment. ESLint and Oxlint versions outside the exact supported pair were
not qualified. This record does not prove any marketplace client refresh.
