# Release Commonplace Lint

Publish `@commonplaces/oxlint-plugin` from this repository. The original
GitHub v0.1.0 archive retains its old name. npm publication needs explicit
authority and a checked archive. Do not describe a GitHub release as npm publication.

For later authorised versions, the verified npm archive is the canonical compiled
distribution. Follow [the npm-first procedure](#later-authorised-npm-releases);
a GitHub archive mirror is separate. The workstation GitHub route below also
remains available for an explicitly authorised archive release.

## GitHub release from a workstation

1. For later releases, add a Changeset and run `bun run version-packages` on a
   reviewed branch. The first package version is 0.1.0. Update the version in
   installation examples deliberately; keep old version notes and tags.
2. Run `bun install --frozen-lockfile`, `bun run test` and
   `bun run verification`. Review the diff, commit, open a pull request and
   merge with normal permissions. Do not bypass required checks.
3. Check out the exact merge commit in a clean worktree. Use Bun 1.4.3 and a
   supported Node version. Repeat the frozen install, tests and verification,
   then run `bun run pack`. Inspect the archive's files and package metadata.
4. With explicit release authority, tag that checked commit and release its
   archive. For the initial version:

   ```sh
   git tag v0.1.0
   git push origin refs/tags/v0.1.0
   gh release create v0.1.0 dist/npm/commonplace-oxlint-plugin-0.1.0.tgz --verify-tag --title "Commonplace Lint 0.1.0" --notes-file /tmp/commonplace-lint-release.md
   ```

5. Read back the tag commit and release asset. Download the asset without
   authentication and compare its SHA-256 checksum with the local archive.
   Install the public URL in a fresh consumer, run its lint configuration and
   check the package version. Record the commit, checks, checksum and release
   URL in a dated file under `docs/evidence/`, then merge that record's PR.
6. Only after this proof, update consuming projects and marketplace templates
   to the exact npm version (or release URL before npm publication). Their
   lockfiles retain the archive integrity.

If CI cannot start because of account limits, read the failed job annotations
and record that fact separately from passing local checks. Do not change
billing or branch protection. If GitHub requires a check that cannot run, stop
before merging. No deployment plan or provider apply is needed for this library.

Never replace a published tag or archive. Correct an error in a new patch
release, and move consumers back to the last checked version if needed. If a
release request has an uncertain result, read the existing release and asset
before retrying. Resume only from the last confirmed step.

## First npm publication

1. Check `npm whoami` and `npm org ls commonplaces --json` before publishing.
   The expected user is `crcorbett`, with owner access. Complete any security
   checks requested by npm.
2. Obtain explicit npm publication authority. Use the exact reviewed GitHub
   release archive after comparing its checksum; sign in with `npm login` and
   check `npm whoami`. Never save a token in this repository or a chat.
3. Publish and verify the registry result:

   ```sh
   npm publish commonplaces-oxlint-plugin-0.1.1.tgz --access public --ignore-scripts
   npm view @commonplaces/oxlint-plugin@0.1.1 name version dist.integrity
   ```

If npm reports that the upload is being processed, wait for the version to
appear before checking its integrity. Do not publish it again. The GitHub
workflow waits for up to ten minutes; on timeout, inspect registry status
before retrying any publication.

4. Install that exact registry version in a fresh consumer and run its lint
   configuration. Compare the registry integrity with the checked archive.
5. Just before the first release from GitHub Actions, configure a trusted
   publisher in npm package settings for
   owner `crcorbett`, repository `commonplace-lint`, workflow
   `npm-release.yml`. Allow direct `npm publish`; no environment is configured.
   Configure it when ready to publish from that workflow: npm expires an
   unvalidated configuration after two days. The first successful workflow
   publication validates it. A local publication does not prove this path.
   Use npm's [trusted publisher instructions](https://docs.npmjs.com/trusted-publishers/).
6. For later authorised npm releases, use the npm-first procedure below. The
   existing **Publish Oxlint package** workflow uses Node 24, npm 12.2.0,
   Bun 1.4.3 and a short-lived GitHub identity. No stored npm token is needed.

Alchemy uses the same general release pattern: GitHub Actions runs the package
manager. See its [release workflow](https://github.com/alchemy-run/alchemy/blob/9e3c0584342d67b24a4215f931047aabd230327b/.github/workflows/release.yml).
This repository has no Alchemy stack because the release needs no infrastructure.

## Later authorised npm releases

1. Preserve the exact operation authority: npm publication, GitHub release and
   an archive mirror are distinct actions. Reuse approvals already given for
   the selected version and route; do not require a second approval solely
   because the mirror is unavailable. Do not change credentials, scopes, billing
   or workflows to bypass an upload-host failure.
2. Merge the reviewed version change normally. From its exact clean merge
   commit, run the frozen install, all tests, full verification and native pack.
   Inspect the compiled files, allowed exports, version, rule registrations,
   provenance inputs and actual installed archive before publication.
3. Record the canonical archive's size, SHA-256 and npm integrity. Match the
   workflow's native npm packing version and file-mode conventions. Where local
   files have protected `0600` modes and CI uses `0644`, pack a separate scratch
   copy with the CI modes while preserving every file's content. Keep the
   original artifact; do not rewrite the release checkout or substitute one
   artifact's hash for another. Prove payload equality and the exact reproduced
   canonical archive instead of assuming a mode difference explains a mismatch.
4. Use the existing trusted publisher on the exact reviewed `main` commit and
   manifest version, following the workflow command below. GitHub release asset
   upload is not a prerequisite for this authorised npm route. An existing
   public tag remains immutable even if a mirror upload fails.
   After upload success, retry availability through bounded read-only checks
   with a recorded deadline. Metadata can become visible before the canonical
   tarball downloads; neither metadata nor workflow success establishes archive
   availability. Never republish a version whose upload or propagation is
   uncertain. If the deadline expires, stop qualification and inspect status.
5. Before advancing consumers, independently read the public registry version,
   `latest`, archive and integrity. Verify its provenance repository, workflow,
   exact source/run and subject digest, then use a fresh anonymous registry
   consumer for exports and actual lint cases. Run `npm audit signatures` and
   distinguish attestation-field inspection from cryptographic verification.
   Verify that the registry's actual `latest` points to this qualified version
   before advancing `latest` consumers. Record the exact tested scope; local
   pack or workflow success alone does not establish public installation or
   consumer acceptance.
6. With GitHub release authority, a published release may link the verified npm
   tarball in its notes while a binary mirror remains unavailable. Read back
   the release/tag target and published status. If no archive is attached, say
   so: neither the release page nor the npm download proves a GitHub asset
   download. Retry a separately authorised mirror only after reading its current
   status; never replace an existing published artifact or tag.

Keep dated evidence for each version and route. Preserve earlier pending-state
observations as history, link a later follow-up and keep marketplace/client
qualification separate from library publication.

## Verify a release through GitHub

After the reviewed version change reaches `main`, record its exact commit and
run the existing workflow with the manifest version. This example uses 0.3.1;
select the exact reviewed manifest version for a later release:

```sh
gh workflow run npm-release.yml --repo crcorbett/commonplace-lint --ref main -f version=0.3.1
```

Inspect the run's commit, job steps and publishing output. A successful local
publication cannot verify GitHub trusted publishing. If GitHub cannot start the
job, retain the failure and do not change billing or required checks. Standard
GitHub-hosted runners are free for this public repository; private repository
minute limits do not by themselves establish a block here.

After success, read the npm version, archive integrity and provenance
attestations. Confirm the build identifies this repository, workflow and release
commit, then install the published version in a fresh consumer and run its lint
checks. Save the run URL and results in dated evidence. Keep the marketplace's
existing pinned version until a separate consumer update is requested.
