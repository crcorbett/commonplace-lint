# First npm publication — 17 October 2026

Cooper authorised npm publication, marketplace updates, pull requests, merges
and local releases. `npm whoami` returned `crcorbett`; `npm org ls commonplaces`
confirmed owner access. No credentials are recorded here.

## Source and GitHub release

[PR #3](https://github.com/crcorbett/commonplace-lint/pull/3) renamed the package
to `@commonplaces/oxlint-plugin` and prepared 0.1.1. It merged as
`0ed87c73ac6fe11fb417e96ce37049998f5f06fc`. The original v0.1.0 tag and archive
were preserved. The 57 rules and existing rule settings are unchanged.

Public GitHub verification passed for both the PR
([38995154570](https://github.com/crcorbett/commonplace-lint/actions/runs/38995154570))
and merged source
([38995407009](https://github.com/crcorbett/commonplace-lint/actions/runs/38995407009)).
A clean detached worktree at the merge commit passed frozen installation,
all 64 tests, full verification and packing. Archive consumers cover Oxlint
1.80.0 and 1.85.0, all eight exports, TypeScript declarations, valid and invalid
lint inputs, and the large syntax graph regression.

[GitHub release v0.1.1](https://github.com/crcorbett/commonplace-lint/releases/tag/v0.1.1)
contains the 47,906-byte archive and SHA256SUMS. Its tag resolves to the merge
commit. An unauthenticated download matched the local archive byte for byte.

- SHA-256: `64b9412ff18405dd85721c3111d1f283c670ebdc294522d10de66f227992df4b`
- npm integrity: `sha512-aiQnXb96QXlD/eAgAD2yHIAiw62byAK4gIhaYTjdMoQAy7ECPAOeDP4WIxa2tddduRErQIm2ES5AAMjgJVswzA==`

## npm publication

The maintainer completed npm's browser security check. `npm publish` accepted
`@commonplaces/oxlint-plugin@0.1.1` with public access and the `latest` tag, then
reported that processing was pending. Initial registry lookups returned 404;
the upload was not repeated. This exposed the workflow's immediate readback
assumption, so its checksum check now waits up to ten minutes for availability.

The registry subsequently returned version 0.1.1 with the expected integrity.
The workflow's exact checksum-wait script passed against this real publication.
An unauthenticated registry download matched both the local and GitHub archives.
A fresh consumer installed the exact npm version with an empty user config and
scripts disabled. All seven plugin exports loaded (57 rules); valid input passed
and invalid input produced the expected unknown-parameter, unknown-return and
console diagnostics. This establishes public npm availability and installation.

## Documentation ownership

Package examples, preset imports, archive-consumer tests and the publishing
workflow use the new name. The release runbook owns publication and recovery
steps. Historical release evidence retains its original package name. Rule
semantics, provider infrastructure and application behaviour did not change.

## Not claimed

GitHub trusted publishing is prepared but has not been configured or executed.
Configure it immediately before its first workflow publication because npm
expires unvalidated configurations after two days. No stored npm publishing
token was added to the repository. No infrastructure deployment or installed
Codex/Claude client refresh is claimed.
