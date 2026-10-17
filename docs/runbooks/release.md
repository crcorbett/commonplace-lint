# Release Commonplace Lint

Publish `@commonplaces/oxlint-plugin` from this repository. The original
GitHub v0.1.0 archive retains its old name. npm publication needs explicit
authority and a checked archive. Do not describe a GitHub release as npm publication.

## GitHub release from a workstation

1. For later releases, add a Changeset and run `bun run version-packages` on a
   reviewed branch. The first package version is 0.1.0. Update the version in
   installation examples deliberately; keep old version notes and tags.
2. Run `bun install --frozen-lockfile`, `bun run test` and
   `bun run verification`. Review the diff, commit, open a pull request and
   merge with normal permissions. Do not bypass required checks.
3. Check out the exact merge commit in a clean worktree. Use Bun 1.4.0 and a
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
6. For later authorised npm releases, manually run **Publish Oxlint package**
   on `main` with the exact manifest version. It uses Node 24, npm 11.13.0,
   Bun 1.4.0 and a short-lived GitHub identity. No stored npm token is needed.

Alchemy uses the same general release pattern: GitHub Actions runs the package
manager. See its [release workflow](https://github.com/alchemy-run/alchemy/blob/9e3c0584342d67b24a4215f931047aabd230327b/.github/workflows/release.yml).
This repository has no Alchemy stack because the release needs no infrastructure.

## Verify a release through GitHub

After the reviewed version change reaches `main`, record its exact commit and
run the existing workflow with the manifest version:

```sh
gh workflow run npm-release.yml --repo crcorbett/commonplace-lint --ref main -f version=0.1.2
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
