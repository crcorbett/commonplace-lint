# GitHub trusted publishing — 17 October 2026

Cooper authorised publishing 0.1.2 through GitHub, including the version PR and
merge, to verify npm trusted publishing. No local npm publication was used.

## Reviewed source and checks

[PR #5](https://github.com/crcorbett/commonplace-lint/pull/5) prepared
`@commonplaces/oxlint-plugin@0.1.2` without changing its 57 rules or settings.
It merged as `44c693cefb1f02630b38e88242c0f9941386cbcd` after
[PR verification](https://github.com/crcorbett/commonplace-lint/actions/runs/38997316245)
passed. Local frozen installation, all 64 tests, full verification and packing
also passed. Archive tests installed the package with Oxlint 1.80.0 and 1.85.0.

## GitHub publication

The manually dispatched [publishing run](https://github.com/crcorbett/commonplace-lint/actions/runs/38997560436)
ran on the exact merge commit above. It passed its tests and verification,
packed the package, published it through the configured npm trusted publisher,
and matched the registry integrity against its own packed archive.

The publisher is `crcorbett/commonplace-lint`, workflow `npm-release.yml`, with
no named environment. The workflow requests a short-lived GitHub identity and
has no stored npm publishing token. npm signed provenance from GitHub Actions
and recorded it in the [transparency log](https://search.sigstore.dev/?logIndex=3288507021).
This successful publication verifies the configured trusted publishing path.

The account's private-repository Actions credit limit did not block this run.
It used `ubuntu-latest` in a public repository, covered by GitHub's
[free standard runner allowance](https://docs.github.com/en/actions/concepts/billing-and-usage).
No billing, runner or branch-protection settings were changed.

## Registry and consumer checks

The public registry returned version 0.1.2 with 59 files and an installable
47,973-byte archive. An unauthenticated download matched the registry integrity.

- Archive SHA-256: `a810ccd2258e51369a97ceea6639474cd8d3fcaedcadb11cce2ecd08bc3c8299`
- npm integrity: `sha512-djngKCghBlXftUByhMPPTwbq1ChtSC86Mv1iRlC9hSVzXnu+o/GULlo89FPl86jLvg9GUeDwWQnXn/dE6nlg8A==`

The registry provenance identifies `.github/workflows/npm-release.yml`, the
repository, exact merge commit and run above. Its subject digest matches the
published archive. A fresh consumer installed exact version 0.1.2 using an empty
npm user configuration and disabled install scripts. All seven plugin exports
loaded with 57 rules. Valid input passed; invalid input failed with the expected
unknown-parameter, unknown-return and console diagnostics.
`npm audit signatures` verified registry signatures and attestations for all
five installed packages.

## Scope

This record proves publication through GitHub Actions and installation from npm.
The private marketplace remains pinned to 0.1.1; updating that consumer is separate
work. Existing GitHub release tags and archives were left unchanged.
