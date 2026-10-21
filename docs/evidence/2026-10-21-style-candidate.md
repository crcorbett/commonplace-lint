# Optional style candidate — 21 October 2026

Superseded by [the latest-dependency candidate](2026-10-21-latest-dependencies.md)
after the owner requested the latest of every package. This earlier trial is
retained as dated evidence.

This records a local candidate, not a release or consumer adoption. The package
manifest remains at the existing unreleased 0.4.1; the accompanying minor
Changeset is for the later authorised version step.

## Sources and version choice

- Library base: `1841659` on `origin/main` (106 existing custom rules).
- Common Practice baseline: `322775f5` on `upstream/main`.
- Site baseline: `13f9835b440123d0f82ecf6a02d1923d0d3629a4`, the current head of
  [Site PR 152](https://github.com/crcorbett/site/pull/152). That PR was still
  open, so testing Site's older `main` would not test the requested strict setup.
- Shared overrides were read from Common Practice's `3b6beef^`
  (`21b0ba541c818fab8a56e272e6d8c6e1caab734e`) and Site's `dda3820` configs.
  All eleven requested global disables occur in both. File overrides remain local.
- Both Ultracite npm archives were packed and inspected; the installed 7.12.0
  source was also read. Pin **7.12.0 as a regular dependency** to restore the
  previously used version without a second consumer install or a missing peer
  breaking root imports. The CLI dependencies are an acknowledged install cost.
- Compared 7.12.0 with 8.0.1: core adds
  `typescript/no-generated-empty-object-type`; Vitest adds
  `vitest/consistent-test-it`; React's `jsx-no-target-blank` adds `forms: true`.
  Core/Vitest test patterns add `mts`, `cts`, `mjs`, `cjs`. No rule is removed;
  other rule settings, shared ignores, globals and plugin lists are unchanged.
  Counts including off entries and scoped rules: core 536 → 537, React 124 →
  124, Vitest 74 → 75. This comparison covers the three selected Oxlint presets.
- Local Effect reference: `e17ecdbe902aa7108f775c8ab9c0ddf9f38801ab`;
  Alchemy reference: `db20b54e8c55e8cede9ef66ad2dd25b7e74d35da`.
  Existing installed Effect 4.0.2 types and native test services were checked.
  No Effect, Alchemy or Oxlint dependency was upgraded.

The [package guide](../../packages/oxlint-plugin/README.md#optional-style-preset)
owns the eleven overrides and their individual reasons, plus the three
supported-host adjustments. One unsupported loop-rule option is removed;
three upstream disables are omitted so strict's correctness rules remain active
(two React rules and the scoped Vitest title rule). `style` imports no strict
settings and `strict` is unchanged.

## Library checks

- `bun run test --maxWorkers=2`: 164 tests passed in 18 files. The worker limit
  avoids competing native lint processes exhausting this workstation.
- Archive and composition checks: 5 tests passed across Oxlint 1.80.0, 1.85.0,
  1.86.0, including compiled TypeScript imports, standalone core/React/Vitest
  failures, resolved safety settings and scoped overrides. Strict-only reports
  retain the same rule, message, severity and filename after a combined run.
- `bun run verification`: passed formatting, lint, both Knip checks, TypeScript,
  build and repository/document ownership checks.
- Deliberately changed an override, replaced a preset, and restored the scoped
  Vitest disable. All three broken variants failed their tests (exit 1).
  Restored the build; the original tests pass. No broken variant was shipped.
- A pre-existing macOS test-path mismatch was fixed in the workspace-import
  fixture helper by resolving its temporary folder's real path. Rule code is
  unchanged. The design detector's broken-image warning is suppressed only for
  the intentional negative image fixture file; no design issue remains open.

## Packed candidate

Created with `npm pack --ignore-scripts` after building; no publication command
ran. The archive contains 93 files: compiled JavaScript/declarations, manifest,
README and licence. Both consumer installs were read back: package 0.4.1,
Ultracite exactly 7.12.0, and `dist/style.js` byte-identical to the archive.

- SHA-256: `af2b2cba700bb07490ed96110a138cd85dc788cda54846203cdea5b077d5c4f5`
- npm integrity: `sha512-q/5L1ozCeVVAhv0YnFcIEsLVZsj1j2hcQrrISR7I34zm0dK03/iK+wDqRc4mFKTxsXyciKgS8ebLdagpaWvuPw==`

## Consumer checks

Both tests used detached temporary worktrees, installed the same archive with
Bun, and changed only the temporary dependency/lockfile and root composition to
`extends: [style, strict, project]`. The temporary install's manifest formatting
was normalised. No consumer implementation, project policy or tests were fixed
or committed.

| Check                                    | Site                             | Common Practice                                                 |
| ---------------------------------------- | -------------------------------- | --------------------------------------------------------------- |
| Original published-package baseline lint | Pass, 0 findings                 | Pass, 0 findings                                                |
| Original baseline unit tests             | 284 pass                         | 451 pass                                                        |
| Candidate with strict + project only     | Pass, 0 findings, 363 files      | Pass, 0 findings, 385 files                                     |
| Candidate with style + strict + project  | 76 errors, 7 rules, 363 files    | 137 errors, 23 rules, 385 files                                 |
| Full command                             | `bun run check` fails at lint    | `bun run verification` builds and formats, then fails at lint   |
| Build and TypeScript                     | Pass                             | Pass during verification                                        |
| Formatting                               | Pass                             | Pass                                                            |
| Effect diagnostics                       | Pass, 0 errors/warnings/messages | Pass, 0 errors/warnings; existing informational messages remain |
| Knip                                     | Both normal and production pass  | Pass                                                            |
| Unit tests with style                    | 283 pass, 1 fails                | 444 pass, 7 fail                                                |
| Site build tests                         | Pass                             | No equivalent script                                            |

The complete commands stop at lint, so the remaining checks were also run
individually. Candidate strict-only results establish that all findings below
come from selecting style. The checked file counts are unchanged.

Site's one failed test is `tools/oxlint/profile.audit.test.ts`, whose expected
composition is still `[strict, project]`. All its other unit tests pass.

Common Practice's seven failures are in
`tools/oxlint/enforcement.audit.test.ts`: one expects `[strict, project]`, and
six acceptance fixtures now also meet style rules (five
`import/newline-after-import` failures and one `max-classes-per-file`). All other
unit tests pass. These failures need a separate consumer adoption change; it
would be incorrect to report the existing full suites as passing with style.

### New lint findings by rule

| Rule                                       |   Site | Common Practice |
| ------------------------------------------ | -----: | --------------: |
| `eslint(array-callback-return)`            |      0 |               1 |
| `eslint(max-classes-per-file)`             |      4 |              14 |
| `eslint(no-duplicate-imports)`             |      0 |               1 |
| `eslint(no-shadow)`                        |      0 |               3 |
| `eslint(prefer-destructuring)`             |      0 |               2 |
| `eslint(prefer-named-capture-group)`       |      0 |               3 |
| `import(consistent-type-specifier-style)`  |      0 |               1 |
| `import(no-duplicates)`                    |      0 |               1 |
| `jsdoc(check-tag-names)`                   |      1 |               1 |
| `promise(prefer-await-to-callbacks)`       |      0 |               1 |
| `react(no-unstable-nested-components)`     |      0 |               3 |
| `typescript(array-type)`                   |      0 |               5 |
| `typescript(consistent-type-imports)`      |      0 |               1 |
| `typescript(no-confusing-void-expression)` |      0 |               6 |
| `typescript(promise-function-async)`       |     67 |              65 |
| `typescript(strict-boolean-expressions)`   |      1 |               1 |
| `typescript(strict-void-return)`           |      0 |               3 |
| `unicorn(no-array-method-this-argument)`   |      1 |              11 |
| `unicorn(no-useless-undefined)`            |      0 |               1 |
| `unicorn(numeric-separators-style)`        |      0 |               7 |
| `unicorn(prefer-query-selector)`           |      0 |               1 |
| `unicorn(relative-url-style)`              |      1 |               1 |
| `vitest(prefer-import-in-mock)`            |      1 |               0 |
| `vitest(require-top-level-describe)`       |      0 |               4 |
| **Total**                                  | **76** |         **137** |

The Promise-function findings include host callbacks whose local style
permissions were removed during strict adoption. This task does not decide
new consumer permissions or add `async` to code protected by strict rules.

## Limits

No npm publication, release, tag, merge, deployment or consumer adoption ran.
No integration, public-endpoint, browser or deployed tracking/workflow suites
ran. Site's separate build tests did run. GitHub CI is separate from these
local results. The 8.0.1 comparison covers core/React/Vitest, not its other
lint engines, CLI behaviour or presets. Consumer findings are a dated snapshot
of the exact commits above; dirty work in the original checkouts was excluded.
