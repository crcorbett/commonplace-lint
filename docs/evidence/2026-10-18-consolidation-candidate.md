# 0.4.0 consolidation candidate — 18 October 2026

State: local qualification complete; review and npm publication pending.
The qualified registry `latest` remains 0.3.1. This record does not establish
publication, provenance attestation or a GitHub release.

## Target and implementation

The source branch is `codex/lint-policy-consolidation`, based on `7087093`.
The manifest is 0.4.0. The candidate retains all 61 prior registrations and adds
33 Effect conventions and 12 web rules, for 106 custom rules and ten compiled
exports. The root adds three optional groups and a `strict` composition; exact
project ownership remains consumer data.

Automatic service checking follows canonical imported names and local Context
services, including mixed data/Stream members and supplied native partial mocks.
It rejects unrelated nested spans. Explicit overload-adapter and host-lifetime
roles are bounded to their actual operation/imports or file/declaration.
Codec checks resolve lexical aliases without granting permission from filenames.
Relative workspace imports remain forbidden outside source directories too.

The optional field-reference list in canonical Schema ownership can be omitted;
configured field lists remain supported. Consumers can retain generic ownership
while moving domain bounds, canonical references, literal values and saved bytes
to direct compiler and behaviour proofs. No installed package is patched.

## Observed checks

- Bun 1.4.0 and Node 24.19.0; pinned Effect 4.0.2 and plugin SDK 1.80.0.
- `bun run test`: 162 tests pass across 17 files, including 67 direct passing/
  failing convention, alias, lifetime, mock, adapter and web cases.
- Independent archive consumers on Oxlint 1.80.0, 1.85.0 and 1.86.0 inspect all
  ten exports and 106 registrations, then run representative accepted/rejected
  cases for defaults, operation aliases, conventions and web rules.
- `bun run verification`: formatting, lint, both Knip graphs, compiler, build
  and repository/documentation checks pass. Test-only case data is excluded
  from the production unused-file graph; the ordinary graph follows it.
- A separate Effect 4.0.4 / Oxlint 1.85.0 consumer passes type-aware lint,
  compiler checks and its real-command enforcement suite against the archive.
  This is separate from library host compatibility and registry availability.

## Call analysis

Calldiff 0.5.0 was run against `HEAD` and the actual working tree, using
`--entry serviceOf` and `--entry referenceOf`, `--max-depth 2` and `--locs`.
Only box-drawing/arrow characters were transliterated for these ASCII receipts:

- [Service resolver](2026-10-18-services-ascii.txt)
- [Import resolver](2026-10-18-aliases-ascii.txt)

These are static navigation aids. Duplicate helper names can have an incorrect
leaf-file attribution in Calldiff's tree; the import resolver actually imports
`propertyName` from `syntax.ts`. A companion returned overload was not a
resolvable `getPage` entry, and its outer factory showed no callstack change.
Actual lint, compiler and direct current-span assertions establish the relevant
behaviour; no execution trace or whole-program equivalence is claimed.

## Archive and recovery

The final candidate's archive and package-input digests are recorded below after
native packing. Reproduce it with the pinned toolchain and inspect/install the
actual archive. A later merge/CI pack is a separate artifact until payload and
release readback establish identity. Previously published 0.3.1 remains unchanged.
Follow the existing release runbook for review, a clean release checkout,
authorised publication and independent registry qualification. Consumers keep a
qualified release or an explicit local candidate until that step is complete.

The inspected native archive contains 91 files; every packaged byte matches
the compiled output, manifest, README or licence in this checkout.

```text
archive: commonplaces-oxlint-plugin-0.4.0.tgz
sha256: fc85a25dc4892251db8c496ff05fd45aa6c3f65336ec43c5e848cd052b9c7aa7
integrity: sha512-5HUPTE2zUrgjMz/eZLaOivRQoSSIDaKcV/leeXs9dSYz155NYs7D8BXbw9kgof+4RKK7ssBzo6iyNReeFSLxGg==
package-inputs-sha256: 498056c18726632d5fc7617ae2fb7e39b6d457f571fbdd7409d831e0ffbe7259
```

The input digest hashes sorted repository-relative paths, a NUL, each file's
SHA-256 and a newline. Its 51 inputs are package source TypeScript, the package
manifest/README/licence and both package tsconfigs, plus the root manifest and
Bun lock. It excludes generated output and this receipt. The archive checksum
is a local qualification result, not a registry provenance claim.
