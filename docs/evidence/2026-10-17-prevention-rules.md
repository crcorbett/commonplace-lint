# Prevention rule qualification — 17 October 2026

Cooper requested shared lint and plugin improvements from the Calico review,
with checks, normal merges, pushes and local releases.

## Reviewed source

[PR #8](https://github.com/crcorbett/commonplace-lint/pull/8) merged as
`08e5b1beb82332740a1203ae4952662c17adc81b`. It adds:

- `package/workspace-import-boundaries`: checked manifest facts drive public
  exports, workspace ownership and configured dependency direction. No project
  names or filesystem reads are embedded in the shared rule.
- `strict-effect/subprocess-pipe-capture`: import-aware syntax checks catch
  known unsafe native Effect pipe collection, including `Stream.mkString`,
  while accepting safe concurrent drains and explicit non-piped channels.

Independent adversarial review corrected ordering, aliases, shadowing,
deferred values, fold initial values, queried assets and export-null cases.
Both rules document their bounded syntax analysis; neither proves all dynamic
control flow or all possible module resolution.

The merge preserves concurrent PR #7 and its test/configuration ownership and
hostname checks. Its earlier 0.2.0 version change and draft release were not
replaced. The combined 0.3.0 catalogue has 61 rules across eight exports.

## Exact-merge local checks

A clean detached worktree at the merge commit used Bun 1.4.0 and Node 24.19.0.
Frozen installation, all 95 tests, full verification and `bun run pack` passed.
The installed archive matrix exercised Oxlint 1.80.0, 1.85.0 and 1.86.0 with
positive and negative cases for both new rules. The source PR's
[public CI](https://github.com/crcorbett/commonplace-lint/actions/runs/39002557880)
also passed.

An independent fresh anonymous consumer installed the exact local archive with
Oxlint 1.86.0. It accepted three files and rejected nine with the expected seven
workspace-boundary and two pipe-capture diagnostics. Inspection found 69 allowed
compiled, documentation, manifest and licence files, eight compiled exports and
61 rules. Every archive file matched the checked release worktree.

- Archive: `commonplaces-oxlint-plugin-0.3.0.tgz`
- SHA-256: `3b2cc30cf293fad551dd9f0f6717ae64d205a8d9675850d6ed042421c1c60cc8`
- Integrity: `sha512-mAXhyfWvVdAJS/tLWT52wNuXkPbnyFxrzKdU7KCUNf9uaJmuPHBhrBmrWQphWQAXtsbynq4TXdKy0GnB4EVMBQ==`

## Initial publication snapshot

The following status was captured before the authorised npm workflow ran.
The later [npm 0.3.0 publication record](2026-10-17-npm-030.md) records the
follow-up separately; the local archive identity above remains unchanged.

The new `v0.3.0` tag was pushed and read back at the exact merge commit above.
The native GitHub release attempt created a draft, but its archive upload to
`uploads.github.com` returned HTTP 401, "Bad credentials". GitHub CLI removed
that failed draft. API reads, normal merges and the tag push succeeded; these
do not establish access to the upload host. A fresh draft was prepared without
assets so an authenticated retry can resume against the existing tag.

No 0.3.0 release asset or npm package has been published. The current public
registry version remains 0.1.2. The task environment has no authenticated local
npm profile; the user has been asked to choose the existing trusted-publisher
upload or supply a local profile. The user has also been asked to make a
release-capable GitHub CLI profile available for the upload host. No credential
value was requested in chat, printed or committed.

Unauthenticated public archive installation, registry integrity/provenance,
normal generated-repository latest refresh, and the final marketplace 0.12.0
release remain pending. A successful local archive test does not establish any
of those publication results. Existing tags and releases were preserved.

## npm follow-up

Cooper subsequently authorised the existing GitHub trusted publisher for the
npm upload. Version 0.3.0 is now public on npm; its published archive has a
different hash because CI's tar members use `0644` permissions instead of the
local archive's `0600`. All 69 members have identical content, type and order.
See the [follow-up record](2026-10-17-npm-030.md) for the distinct published hash,
source and qualification. The GitHub release remains an assetless draft after
the upload-host HTTP 401; npm availability does not establish GitHub archive
availability, marketplace qualification or the plugin release.
