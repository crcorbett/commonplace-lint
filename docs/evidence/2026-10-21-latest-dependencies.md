# Latest dependency candidate — 21 October 2026

This replaces the earlier 7.12.0 style candidate. It records local qualification
of the owner's request to use the latest of every package. No publication or
consumer adoption is authorised by these checks.

## Versions

Checked npm's `latest` tags on 21 October 2026, then pinned every direct external
dependency exactly in the catalog and package manifest. The platform-node-shared
override, Bun declaration and both CI workflows were updated too. The owned
workspace remains a local workspace dependency; its release version is unchanged.

| Package or tool                | Before   | Latest pinned version |
| ------------------------------ | -------- | --------------------- |
| `@changesets/cli`              | 3.0.1    | 3.0.3                 |
| `@effect/platform-node`        | 4.0.2    | 4.0.5                 |
| `@effect/platform-node-shared` | 4.0.2    | 4.0.5                 |
| `@effect/tsgo`                 | 0.38.0   | 0.55.0                |
| `@effect/vitest`               | 4.0.2    | 4.0.5                 |
| `@oxlint/plugins`              | 1.80.0   | 1.89.0                |
| `@types/bun`                   | 1.4.0    | 1.4.3                 |
| `bun`                          | 1.4.0    | 1.4.3                 |
| `effect`                       | 4.0.2    | 4.0.5                 |
| `knip`                         | 6.32.2   | 6.42.1                |
| `npm`                          | 11.13.0  | 12.2.0                |
| `oxfmt`                        | 0.65.0   | 0.74.0                |
| `oxlint`                       | 1.80.0   | 1.89.0                |
| `oxlint-tsgolint`              | 7.0.2001 | 7.0.2004              |
| `turbo`                        | 2.10.11  | 2.11.10               |
| `typescript`                   | 7.0.2    | 7.0.2                 |
| `ultracite`                    | 7.12.0   | 8.0.1                 |
| `vitest`                       | 5.0.1    | 5.0.5                 |

TypeScript was already current. The commands used Bun 1.4.3 and npm 12.2.0
installed in a temporary tool folder; existing global installations were preserved.
The installed Oxlint command reports 1.89.0 and Effect's checker reports 0.55.0.
The upstream 0.55.0 support table accepts Oxlint 1.89.0, oxlint-tsgolint 7.0.2004
and TypeScript 7.0.2. The native patch succeeded for all four targets, including
Oxlint's declaration file. No patch command or dependency warning was treated
as proof that the package tests passed.

Sources: the installed package source, both Ultracite archives, npm metadata,
[Effect's support table](https://github.com/Effect-TS/tsgo#supported-package-versions)
and [native Oxlint setup](https://github.com/Effect-TS/tsgo/blob/main/docs/README.md).
The inspected Effect checker checkout is `018720b8553d9198c5d69b060175ef663e3baa10`.

## Preset and compatibility

`style` uses Ultracite 8.0.1 as a regular dependency. Consumers need no extra
install, and root imports cannot fail because an optional style peer is missing.
The install includes Ultracite's CLI dependencies; importing the preset runs
only configuration modules. Strict still composes the original six groups;
none of the 106 custom rule implementations changed.

The [package guide](../../packages/oxlint-plugin/README.md#optional-style-preset)
contains the eleven shared overrides and a reason for each. All remain the
shared disables read from the two historical consumer configs. File permissions
remain in the consumers.

Compared with 7.12.0, 8.0.1 adds `typescript/no-generated-empty-object-type` and
`vitest/consistent-test-it`, enables form checks in `react/jsx-no-target-blank`,
and extends test matching to `mts`, `cts`, `mjs` and `cjs`. It removes no rule.
Other severities/options, shared ignores, globals and plugin lists are unchanged.
Core has 537 rule names, React 124 and Vitest 75, including off/scoped settings.

Ultracite 8 requires Oxlint 1.86 or newer and Oxfmt 0.71 or newer. The package
now supports exactly **Oxlint 1.86.0 or 1.89.0**; 1.80 and 1.85 are retired.
The old loop-option workaround is removed: both supported hosts accept the
upstream conditional-expression option. The two safety adjustments remain:
omit React's disables for `jsx-a11y/no-autofocus` and
`react/forward-ref-uses-ref`, and omit Vitest's scoped disable for
`vitest/valid-title`. These preserve strict's correctness category without
importing any strict settings into style.

## Latest-tool integration

- Effect 4.0.5 marks the native test host APIs as unstable. The instability rule
  stays enabled. Root test files allow seven exact API exports; package test
  files allow the five they use. No module-wide or production permission is added.
- Root tooling is now included in its TypeScript project, and its reference
  points to the package's real build configuration. This lets the native checker
  read scoped permissions instead of using an inferred project without them.
- The `@effect/language-service` configuration name is provided by `@effect/tsgo`;
  Knip ignores that one virtual dependency name. Duplicate editor diagnostics
  are disabled, while Oxlint's recommended Effect checks stay enabled.
- One real test error class gains the nominal brand required by the new checker.
- A real Oxlint test accepts a named API inside a test file, rejects it outside
  test files, and rejects an unlisted API inside a test file.
- npm 12 returns `npm pack --json` as an object keyed by package name, replacing
  npm 11's array. The Schema reader accepts both checked formats. Release
  filename/integrity selectors now use the npm 12 key; both were run against
  a real packing report. The publishing step itself was not run.

## Library checks and archive

- Frozen installation, full verification and all **164 tests in 19 files** pass
  with the updated tools. The suite uses `--maxWorkers=2` to bound competing
  native lint commands on this workstation.
- Separate npm 12 archive/composition checks pass on both supported hosts.
  They install the actual archive, compile its public imports, prove core,
  React and Vitest violations fail with style, compare every resolved strict
  setting and scoped override, and preserve strict diagnostic output.
- Broken override, preset composition and scoped safety variants each fail
  their tests; the restored versions pass.
- npm 12 packed 93 files: dist, manifest, README and licence. No tests, source
  maps, skills or credentials are included. Both consumer installations were
  read back: Oxlint 1.89.0, SDK 1.89.0, Effect 4.0.5, Ultracite 8.0.1 and
  compiled style bytes identical to this archive.

Archive SHA-256: `a4c90c520b47e917cdcb2e97ee8f7cc9a9f722a7d24a11188cdcdd8c602c5ade`.

npm integrity: `sha512-BcHmCKquzX0pyq3eCB0TUtR6ThnJNXphZseCYfYguZQMIiuI0bLj74OtKdRxq6GydkfOo15665ka1hUTkFAYVw==`.

## Consumer results

Use the same exact consumer commits as the earlier trial: Site PR 152 head
`13f9835b440123d0f82ecf6a02d1923d0d3629a4` and Common Practice main `322775f5`.
Only detached temporary worktrees changed. Alongside the archive, those test
worktrees use Oxlint/SDK 1.89.0, oxlint-tsgolint 7.0.2004, Oxfmt 0.74.0 and
Effect linting 0.55.0, with successful native patches. These are temporary test
setup changes, not consumer adoption. Source, tests and project policies were
not fixed or committed.

| Check                                         | Site                          | Common Practice                                           |
| --------------------------------------------- | ----------------------------- | --------------------------------------------------------- |
| Original published-package baseline           | Clean lint; 284 tests pass    | Clean lint; 451 tests pass                                |
| New candidate/tools, strict + project only    | Clean, 363 files              | Clean, 385 files                                          |
| New candidate/tools, style + strict + project | 76 errors, 7 rules, 363 files | 141 errors, 24 rules, 385 files                           |
| Full command                                  | `bun run check` stops at lint | `bun run verification` builds/formats, then stops at lint |
| Build and TypeScript                          | Pass                          | Pass during verification                                  |
| Formatting                                    | Pass                          | Pass                                                      |
| Effect checks                                 | Pass                          | Pass                                                      |
| Knip                                          | Normal and production pass    | Pass                                                      |
| Unit tests                                    | 283 pass; 1 fails             | 444 pass; 7 fail                                          |
| Build tests                                   | Pass                          | No equivalent script                                      |

Remaining checks were run separately after the full commands stopped. Checked
file counts match strict-only checks. Site's unit failure expects the old
`[strict, project]` composition. Common Practice has the same expectation plus
six lint-fixture acceptance failures: five `import/newline-after-import` and one
`max-classes-per-file`. All other unit tests pass. Consumer adoption still needs
its own changes and authority.

### New style findings by rule

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
| `vitest(consistent-test-it)`               |      0 |               4 |
| `vitest(prefer-import-in-mock)`            |      1 |               0 |
| `vitest(require-top-level-describe)`       |      0 |               4 |
| **Total**                                  | **76** |         **141** |

Common Practice has four more findings than the 7.12.0 trial, all from the new
`vitest/consistent-test-it` rule. Site's count is unchanged. The Promise-function
findings include native callback boundaries; this task grants no new consumer
permissions and adds no `async` keywords to their code.

## Limits

No npm publication, release, tag, merge, deployment or consumer adoption ran.
Integration, public endpoint, browser and deployed tracking/workflow suites were
not run. Site's separate build tests did run. CI remains separate from local
proof. npm 12 packing and metadata extraction are checked; trusted publication
with the upgraded workflow remains untested until separately authorised.
The original dirty consumer checkouts were preserved; temporary worktrees are
removed after recording the results. Earlier evidence remains a dated record,
not a description of this updated candidate.
