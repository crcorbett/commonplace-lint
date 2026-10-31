# @commonplaces/oxlint-plugin

109 custom Oxlint rules for strict Effect TypeScript, Alchemy and general code
checks. Version 0.9.0 supports **Oxlint 1.88.0, 1.89.0 or 1.90.0** and **Node 22.14 or newer**.
Oxlint's JavaScript plugin API is experimental, so upgrade it only after running
the rule tests. The development tools use 1.90.0; consuming projects may use any supported version.
All three exact versions are checked with independently installed archives. ESLint is not a supported host.

Version 0.6.0 adds native Effect correctness and immutable accumulation checks.
When upgrading from 0.5.0, use a supported Oxlint version and run the native
Effect setup below after dependency installation.

## Install

Install version 0.9.0 and save its exact version:

```sh
npm install --save-dev --save-exact @commonplaces/oxlint-plugin@0.9.0 \
  @effect/tsgo@0.63.0 oxlint@1.90.0 oxlint-tsgolint@7.0.2005 typescript@7.0.2
```

Version 0.9.0 supports exactly Oxlint 1.88.0, 1.89.0 or 1.90.0. Older releases
keep their earlier host lists. Version 0.9.0 removes 1.87.0 because the native
Effect checker no longer supports it. Upgrade Oxlint before adopting this release.
Consumer adoption is a separate step.

The manifest and lockfile retain the resolved version. Historical GitHub release
archives remain separate distribution artefacts; a GitHub release does not publish
an npm version.

Create `oxlint.config.ts`:

```ts
import { defineConfig } from "oxlint";
import { general, effect, alchemy } from "@commonplaces/oxlint-plugin";

export default defineConfig({
  extends: [general, effect, alchemy],
});
```

Then run `npx oxlint .`. Choose only the groups that fit your project. `general`
checks code style and package imports; `effect` checks Effect code; `alchemy`
checks native Alchemy settings and secret sources. Each group turns its checks
on as errors. They do not depend on one another. Override individual rules in
your own `rules` or `overrides` settings.

The root also exports `conventions`, `web` and `typescript`. `conventions` enables
strict Effect coding conventions; `web` adds React/TanStack, MDX and typography
checks; `typescript` enables native type-aware safety checks and correctness
errors. Run the latter with `oxlint --type-aware --deny-warnings .`. These groups
contain no application paths. Codec and runtime permissions remain explicit
project facts.

`strict` composes all six groups for applications that use the complete stack:
`defineConfig({ extends: [strict, projectPolicy] })`. It adds no project paths
or source ignores. Keep exact ownership settings in the consuming project.

The root exports these six groups, the optional `style` preset and the `strict` composition. Individual plugins use
the subpaths below. For example, a JSON configuration can enable one rule:

```json
{
  "jsPlugins": ["@commonplaces/oxlint-plugin/strict-effect"],
  "rules": { "strict-effect/static-layers": "error" }
}
```

## Native Effect correctness

Both `effect` and `strict` include every check in the pinned
`@effect/tsgo` **0.63.0** correctness preset, all at error level. This catches
forgotten Effect programs, incorrect generator yields, unhandled errors and
requirements, unchecked Effect type assertions, missing Schema class brands and
unstable APIs. Type-aware checking is enabled by the group itself; consumers
do not need to import another preset. Upstream's unrelated style and maintainer
preferences are not added to the public group.

The package ships `@effect/tsgo` **0.63.0** and `oxlint-tsgolint` **7.0.2005**
as exact regular dependencies. Full Effect projects should also declare their
compiler and checker tools directly, as in the install command above. This
keeps the selected local tools explicit. The pinned checker supports TypeScript
**7.0.2**, **7.1.0-beta** or **7.1.0-dev.20261028.1**, alongside the three Oxlint versions above.
The archive tests use TypeScript 7.0.2.
Check the installed checker's supported versions before changing these tools.

Use [Effect's recommended automatic setup](https://github.com/Effect-TS/tsgo/blob/main/docs/README.md).
Add this command to the consuming project's root `package.json`:

```json
{
  "scripts": {
    "prepare": "effect-tsgo patch --oxlint"
  }
}
```

Merge the patch command into an existing `prepare` script with `&&`; retain its
hooks, code generation and build tasks. Add it once at the repository root.
Run `npm install` after editing the script. Future installs, including clean
CI installs, run it automatically. Then run the project's normal strict
TypeScript and Oxlint commands, including `oxlint --deny-warnings .`.

This prepares both the TypeScript compiler and Oxlint. Do not use
`--no-typescript` for a full Effect project. That option is only for an explicit
Oxlint-only host which has no supported native TypeScript compiler; record that
host constraint rather than making it the shared default. Do not use
`--skip-missing` to hide missing tools or incompatible versions.

For initial configuration, the installed `effect-tsgo setup` command can guide
TypeScript, Oxlint and editor setup. Review its proposed changes against the
project's existing strict rules and exact dependency versions. Keep the shared
presets and all project-specific restrictions active.

If a deliberate install or lint-package refresh uses `--ignore-scripts`, run
`effect-tsgo patch --oxlint` explicitly after that operation and before checking
code. An earlier successful prepare does not cover replaced binaries. Missing
native setup causes a configuration error rather than silently losing checks.

Keep a normal `tsconfig.json` covering the checked files. Native diagnostic
options, such as exact unstable APIs approved for particular test files, live
under the `@effect/language-service` compiler plugin configuration. Leave its
`diagnostics` option false when Oxlint owns reporting. The archive tests prove
that forgotten work fails even without `--deny-warnings` and without a caller
adding `--type-aware`.

## Optional style preset

Add `style` before `strict`, then keep the project's own policy last:

```ts
import { style, strict } from "@commonplaces/oxlint-plugin";
import { defineConfig } from "oxlint";
import project from "./tools/oxlint/project.config.ts";

export default defineConfig({ extends: [style, strict, project] });
```

Run `oxlint --type-aware --deny-warnings .`. `style` also works alone and is
available as the default export of `@commonplaces/oxlint-plugin/style`.
It never imports or extends `strict`; `strict` still contains only its original
six groups. Adding `style` leaves strict settings unchanged. This preset includes more than formatting preferences: Ultracite
also supplies accessibility, test and correctness checks, browser globals,
shared ignores and test-file overrides. Its ignores can reduce which files are
checked; keep the project's own file policy explicit.

Ultracite **8.0.1** is an exact regular dependency, selected at the owner's
request to use the latest releases. It requires no separate consumer install. A peer would
make consumers choose and install a second package, and could make imports of
the root package fail when it is missing. The dependency also installs
Ultracite's CLI dependencies; only the three Oxlint configuration modules run
when importing this preset. No Ultracite CLI, formatter or Effect runtime runs.

### Shared overrides

These eleven rules are off in both historical root configurations: Common
Practice at `3b6beef^` and Site at `dda3820`. File-specific permissions and
size limits remain in each consumer's project policy.

| Rule set to `off`                     | Reason                                                                                                                           |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `unicorn/no-array-for-each`           | Allow Effect's immutable `Array.forEach`; strict collection checks cover native mutation.                                        |
| `unicorn/no-array-sort`               | Allow Effect's immutable `Array.sort`; strict collection checks cover native mutation.                                           |
| `unicorn/throw-new-error`             | Allow the `Schema.TaggedError` factory; `strict-effect/error-constructor-new` checks error construction when strict is selected. |
| `no-redeclare`                        | Allow TypeScript overloads and merged declarations.                                                                              |
| `react/function-component-definition` | Allow the project's existing component declaration forms.                                                                        |
| `sort-keys`                           | Keep related object fields in meaningful order.                                                                                  |
| `func-names`                          | Allow unnamed library callbacks and Effect generators.                                                                           |
| `func-style`                          | Allow function declarations and functions stored in constants.                                                                   |
| `no-use-before-define`                | Allow declarations to refer to later declarations.                                                                               |
| `no-inline-comments`                  | Allow short explanations beside the code they describe.                                                                          |
| `typescript/consistent-return`        | Leave return types and Effect generator branches to TypeScript.                                                                  |

### Effect compatibility

Style must accept the code required by strict Effect. Putting `strict` last
only resolves two settings for the same rule; it cannot stop a different style
rule asking for forbidden code. For example, `typescript/promise-function-async`
asks for `async` on a host callback that returns `Effect.runPromise(...)`, while
both strict async checks reject the added keyword. Return the Promise directly
at the approved host boundary. Keep ordinary application work in Effect.

The preset turns off these additional style rules, including when used alone:

| Rules set to `off`                                                              | Reason                                                                                         |
| ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `require-await`, `typescript/promise-function-async`, `typescript/return-await` | Do not ask for `async` or `await`. Strict rules own Promise boundaries.                        |
| `promise/prefer-await-to-callbacks`, `promise/prefer-await-to-then`             | Do not replace callbacks or Promise chains with `await`; use Effect at the owning adapter.     |
| `typescript/prefer-for-of`, `unicorn/no-array-reduce`                           | Do not suggest loops. Allow Effect's immutable `Array.reduce`, including renamed imports.      |
| `oxc/no-accumulating-spread`                                                    | Its mutation advice is replaced by `strict-effect/no-copying-accumulator` in the Effect group. |
| `unicorn/prefer-at`                                                             | Use checked Effect collection access instead of native `.at`.                                  |
| `unicorn/prefer-date-now`                                                       | Use Effect's clock instead of `Date.now`.                                                      |
| `unicorn/prefer-reflect-apply`                                                  | Do not suggest `Reflect.apply`, which strict rejects.                                          |
| `unicorn/prefer-set-has`                                                        | Use Effect collections instead of suggesting a native mutable `Set`.                           |
| `typescript/non-nullable-type-assertion-style`                                  | Do not replace a type assertion with `!`; strict rejects both unchecked forms.                 |
| `unicorn/prefer-ternary`                                                        | Do not request ternaries while strict's `no-ternary` is enabled.                               |
| `max-classes-per-file`                                                          | Keep related Schema error classes or service contracts in their owning module.                 |

These changes do not grant runtime, SDK or Promise permissions. Keep exact host
files in the project's policy. Strict still rejects async/await, raw Promises,
loops, mutation, unchecked access, thrown failures and unapproved runtime calls.
The collection convention accepts `Array.reduce(initial, callback)(values)`;
its three-argument form `Array.reduce(values, initial, callback)` still fails.

`strict-effect/no-promise-workflow` also rejects every runtime `import()` expression,
including imports wrapped in `Effect.tryPromise` and imports in exact
`allowedFiles` or `promiseOnlyFiles` owners. Those permissions adapt host Promise
contracts; they do not permit dynamic module loading. Use static imports and
defer service initialisation through native Effect or Atom lifetimes where needed.
Static imports, re-exports and TypeScript-only `import("module").Type` references
remain valid. Framework-generated output stays subject to the consumer's existing
generated-file exclusions; there is no adapter exception to this prohibition.

### Supported-host adjustments

The imported configurations need two small adjustments; these are separate
from the eleven shared overrides above:

- React's explicit disables for `jsx-a11y/no-autofocus` and
  `react/forward-ref-uses-ref` are omitted. This lets the host's correctness
  settings apply: selecting `strict` keeps both at error level. Merely putting
  `strict` last would not overcome an explicit upstream disable when strict
  enables a rule through its correctness category.
- Vitest's file override disabling `vitest/valid-title` is also omitted, so
  strict's correctness setting still applies inside test files.

The tests install the packed archive on every supported host and compare
every resolved strict rule, including its options, with `[style, strict]`.
They also check inherited file overrides. Type-aware archive tests compile and
lint approved host callbacks, SDK adapters, Effect programs, immutable
collections and related error classes. Restoring the async style rule makes the
host example fail, proving the type-aware check runs. Forbidden examples must
retain every strict diagnostic after style is added. The adjustments import no
strict settings; other upstream settings remain intact.

### Ultracite 8.0.1 comparison

The installed npm archives were compared, including rule options and file
patterns, rather than relying on release notes. For the three selected presets:

| Preset | Rules in 7.12.0 | Rules in 8.0.1 | Change                                                        |
| ------ | --------------: | -------------: | ------------------------------------------------------------- |
| Core   |             536 |            537 | Adds `typescript/no-generated-empty-object-type` as an error. |
| React  |             124 |            124 | `react/jsx-no-target-blank` adds `{ forms: true }`.           |
| Vitest |              74 |             75 | Adds `vitest/consistent-test-it` as an error.                 |

Counts include entries explicitly set to off and entries in file overrides.
No rule is removed and no other rule severity or option changes. Core's shared
test overrides and Vitest's test rules also start matching `.mts`, `.cts`,
`.mjs` and `.cjs` files. Shared ignores, globals and plugin lists are unchanged.
Both versions contain `no-unmodified-loop-condition` with
`checkConditionalExpressions: true`; the supported hosts accept that option.
Ultracite 8 requires Oxlint 1.86 or newer, so 1.80 and 1.85 are no longer
supported. Its Oxfmt peer requires at least 0.71; repository tooling uses 0.74.0.
The current archive is checked on exactly 1.88.0, 1.89.0 and 1.90.0, matching the
pinned native Effect checker. Published 0.5.0 was qualified on 1.86.0 and 1.89.0.

## Project settings

Rules that refer to project files, schemas or routes are available but excluded
from the groups. Configure them explicitly, for example:

```ts
import { defineConfig } from "oxlint";
import { general, effect } from "@commonplaces/oxlint-plugin";

export default defineConfig({
  extends: [general, effect],
  rules: {
    "effect/no-runtime-execution-outside-main": [
      "error",
      {
        allowedFiles: ["apps/cli/src/main.ts"],
      },
    ],
    "effect/require-service-operation-instrumentation": [
      "error",
      {
        serviceNames: ["Orders"],
      },
    ],
    "strict-effect/module-ownership": [
      "error",
      {
        owners: [
          {
            module: "vendor-sdk",
            allowedFiles: ["packages/orders/src/live.layer.ts"],
            allowTypes: false,
          },
        ],
      },
    ],
  },
});
```

Use repository-relative paths with `/` separators. Runtime execution is denied
everywhere unless `allowedFiles` grants an entry file. Service tracing is enabled
by `effect` without a service-name inventory. It checks native local
`Context.Service` constructors and imported capitalised service `.of` calls,
plus supplied operations in native `Layer.mock` replacements,
preserving canonical names through named imports, namespace imports and immutable
aliases. Shadowed names cannot borrow import identity. Every explicit operation
requires its exact `Effect.fn("Orders.create")` or `Effect.withSpan` name.
Readonly resource groups are traversed recursively, including local immutable
aliases: `Orders.session.read` requires that full canonical span. Each supplied
leaf in `Layer.mock` is checked too. Empty resource groups, cyclic groups,
spreads and dynamic property names fail closed; local nested contract types
continue to identify data and Stream members.
Legacy `serviceNames` selection remains available for existing consumers.
An empty selector is rejected.

Local contract types identify checked data and Stream members; native Stream
expressions also retain their role in imported mixed contracts. Opaque members
fail closed rather than gaining a name-based exemption. Instrumentation must
wrap the operation or its returned Effect; an unrelated nested span is
insufficient. The rule examines syntax, not a cross-file TypeScript type graph;
an imported capitalised non-service `.of` API may require a distinct API shape.
Empty partial mocks contain no supplied operation to instrument. The rule does
not infer contracts for arbitrary Layer factories or raw `Layer.succeed` data
objects; retain typed composition and review those boundaries.

For a canonical operation adapter that preserves an overloaded service API,
`operationAdapters` can name its public `module`, exact source `file`, `exports`
and canonical `operation`. The adapter owns the returned operation's span.
Prove that guarantee directly against the real adapter, with an uninstrumented
callback and observed current span. Only that operation and those imported
exports gain this role; shadowed functions, neighbouring modules and other
service operations still require their own spans. This is an explicit contract
owner where cross-file type analysis is unavailable, not a general wrapper
permission.
Invalid settings stop linting. Each rule's exported `meta.schema` describes its
accepted options; no marketplace plugin is needed to read or run them.

The portable Effect checks use the existing `strict-effect/` names, and the
Alchemy checks use `alchemy-secrets/`. Keep those names when moving from copied
rule files. Remove the copied implementations and change `jsPlugins` to the
package subpaths; keep your existing rule settings. The native-source rule
recognises both `alchemy/Doppler` and the Alchemy beta.84 provider package
`@alchemy.run/doppler`.

## Static Atoms and Layers

The `effect` and `strict` presets enable `strict-effect/static-atoms` and
`strict-effect/static-layers` as errors. Declare definitions as static values;
let the native registry and Scope own their state and resource lifetimes.
Factories that return these definitions create unnecessary configuration APIs
and make identity and ownership harder to follow.

```ts
// Rejected: each call creates a new definition.
export const makeClientAtom = (runtime: Atom.AtomRuntime<never>) => runtime.atom(configure);

// Accepted: one definition, with checked inputs and resource state per registry.
export const configurationAtom = Atom.make(checkedConfiguration);
export const clientAtom = Atom.make((get) => configure(get(configurationAtom)));
```

Supply host configuration through input Atoms and the existing registry's
`initialValues`. Acquisition can remain deferred inside the static Atom; a static
definition does not make the acquired client global. Static action Atoms can
still accept operation inputs. Use a static `Atom.family` for genuinely keyed
definitions, where Effect owns the cache, rather than an owned factory.

The Atom rule follows native imports, immutable aliases, checked Atom return
annotations and local `Atom.runtime` values or parameters annotated as
`AtomRuntime`. It checks private functions, methods, signatures and callbacks
to unknown helpers in source, tests and tools. Static definitions, native family
callbacks, partial combinators, value reads and registry constructors remain
valid, including `optimisticFn`'s native `fn` callback. Neither rule provides an
automatic fix or factory exception options.
This is local syntax analysis: opaque imported helpers or an unannotated runtime
import require review; the rule does not infer cross-file return types.

## Immutable accumulation

`effect` and `strict` enable `strict-effect/no-copying-accumulator` as an error.
It catches repeated array accumulator spreads, growing object spreads, copying
`Array.append`/`prepend`/`appendAll`/`prependAll`/`union`/`copy` calls and
`Record.set`/`union` calls in Effect reducers. Repeatedly copying an ever larger
result can make a modest input expensive to process.

Use `Array.map` or `Array.flatMap` to produce an array. Use `Record.fromEntries`
to build a record in one pass. When genuine accumulation is needed, use
persistent `Chunk.append`, `HashMap.set` or `HashSet.add`, which share existing
structure. The rule never suggests mutation and has no automatic fix.

It recognises imported Effect `reduce`, `reduceRight`, `scan` and `scanRight`
operations, including named, namespace, renamed and immutable aliased imports.
Both argument orders and locally declared callbacks are covered. It follows
accumulator aliases, fields and destructured fields, checks copied values by
their actual local binding, and recognises a copier as the first pipe operation.
Shadowed names, unrelated libraries, scalar folds, spreads of the current input
and fixed-shape object spreads remain valid. `Array.fromIterable` is allowed: the
installed Effect version reuses an input array rather than copying it.

This is a local written-pattern check. It does not follow imported callbacks,
opaque helper implementations, mutable aliases or an accumulator through later
pipe operations, and it does not measure input sizes or prove a runtime cost.
Native loops and mutation remain forbidden by the separate strict rules.

## Rule exports

| Package subpath     | Rule prefix           | Rules |
| ------------------- | --------------------- | ----: |
| `/strict-effect`    | `strict-effect/`      |    32 |
| `/effect`           | `effect/`             |     9 |
| `/alchemy`          | `alchemy-secrets/`    |     3 |
| `/bun`              | `bun/`                |     1 |
| `/package`          | `package/`            |     3 |
| `/anti-slop`        | `anti-slop/`          |    15 |
| `/anti-slop-effect` | `anti-slop-effect/`   |     1 |
| `/conventions`      | `effect-conventions/` |    33 |
| `/web`              | `web/`                |    12 |

### Explicit codec and runtime roles

The three optional codec-placement checks in `/conventions` follow real Schema
imports, named aliases, destructured exports and immutable aliases, respecting
local shadowing. Add them through positive scopes that exclude exact ingress,
egress or synchronous consumer owners. A filename ending in `.ingress.ts` or
`.egress.ts` grants no permission on its own. `Schema.decodeTo` and `encodeTo`
declarations remain transformations rather than codec execution.

`effect-conventions/scoped-managed-runtime` requires acquisition and the
matching runtime disposer through `Effect.acquireRelease`. For a host that owns
an isolate/process lifetime and offers no termination callback, `hostLifetimes`
may identify its exact top-level `const` by repository-relative `file` and
`declaration`. Another declaration, nested construction or neighbouring file
still fails. This role does not permit additional runtime execution files.
Use the separate runtime execution owner rule as well.

`browser-runtime-ownership` takes `runtimeOwners` and `registryOwners`.
`native-http-client-ownership` takes `browserOwners` and `serverOwners`.
`bounded-build-memo` takes exact `targets` with `file` and `declaration`.
These are optional rules in `/conventions`; malformed allowances fail closed.
The memo check requires immutable bounded includes and `lockfile: true`, and
rejects excluded dependencies, opaque or overwritten settings and broad parent
recursion outside `src`. There are no application path defaults.

## Development

### Workspace import boundaries

Enable `package/workspace-import-boundaries` explicitly. Supply options derived
from checked, current workspace manifests at configuration ingress; the rule
does not read the filesystem or keep its own project inventory.

```ts
"package/workspace-import-boundaries": ["error", {
  owners: [
    { id: "root", root: "." },
    { id: "website", root: "apps/website" },
    { id: "orders", root: "packages/orders" },
  ],
  workspaces: [{
    name: "@example/orders",
    owner: "orders",
    exports: { ".": false, "./service": true, "./features/*": true, "./features/private/*": false },
  }],
  workspacePrefixes: ["@example/"],
  forbiddenEdges: [{ from: "website", to: "orders" }],
  exceptions: [{ fromFile: "apps/website/src/approved.ts", toModule: "@example/orders/service" }],
  aliases: [{ prefix: "@website/", root: "apps/website/src" }],
}]
```

The example is illustrative; derive the actual owners, package names and export
facts from manifests. Export booleans record reachability under the consumer's
selected conditions. Preserve explicit `null` fences as `false`. Exact exports
beat single-star patterns, and the most specific matching pattern wins. The
longest anchored root identifies an owner, including root composition files.
Cross-owner filesystem imports are rejected even when they reach a workspace
root or a non-`src` file. Exact exceptions can permit an owner edge, but cannot
expose a private export or permit a cross-owner filesystem path.

The check covers static imports, re-exports, type imports, import-equals,
unshadowed `require` and dynamic addresses resolvable through immutable local
strings. Unresolved computed addresses are outside its proof. Explicit aliases
are bounded directory prefixes; this is not a TypeScript, bundler, conditional
export or symlink resolver. Same-owner asset queries are allowed; `file:` imports
are unsupported and rejected. Invalid or contradictory options fail closed.

### HTTP response-body error classification

The `effect` and `strict` groups enable `strict-effect/http-client-error-classification`.
Effect's HTTP `DecodeError` includes connection failures while reading a response
body. Do not map every `DecodeError` to a payload/integrity failure while mapping
`TransportError` to unavailability. Use the transport recovery path by default;
distinguish deliberate size limits or other payload failures with a tagged cause.
Keep malformed JSON/schema errors separate and test failure after response headers.

The rule checks native `Match.tags`/`tagsExhaustive` tables containing
`DecodeError`, `TransportError` and `StatusCodeError`. It rejects unconditional
results using different error constructors, following immutable local aliases,
simple return helpers and `Effect.fail`/`succeed`. Imported aliases and shadowing
are respected. It does not prove conditional branches, opaque helpers, computed
tables or other dispatch styles: behavioural tests still own their semantics.
There are no project-specific names, configuration options or automatic fixes.

### Subprocess pipe capture

The `effect` group enables `strict-effect/subprocess-pipe-capture`. It follows
native Effect process handles and rejects statically identified collection that
can wait for a child or one pipe while another captured pipe remains undrained.
Drain stdout, stderr and exit completion in one scope, for example with
`Effect.all({ stdout: read(handle.stdout), stderr: read(handle.stderr),
exitCode: handle.exitCode }, { concurrency: "unbounded" })`.

The rule accounts for known job order and concurrency, and accepts known
non-piped channels. It is bounded syntax analysis, not proof against every
process deadlock: computed jobs, unknown wrappers and unsupported control flow
still require review. A small-output test cannot establish safe capture. Test
both pipes beyond pipe capacity, a nonzero exit, UTF-8 and scoped cleanup.

This workspace owns the rule code. Skills provide guidance and installation
instructions; they do not carry another copy of the rules. The package contains
compiled JavaScript and declarations, the README and the MIT licence. It does
not contain the private marketplace's skills, icons, source maps or tests.

Run `bun run build:lint-plugin` from the repository root before linting. Root
installation and lint/test commands do this automatically. Local consumers and
npm consumers use the same compiled exports; there is no source-only export
condition to hide packaging mistakes. Run `bun run test:lint-rules` for existing
integration checks and `bun run test` for the archive installation
and public contract checks.

Oxlint owns synchronous rule callbacks and reporting. Pure checks use immutable
Effect collections. The synchronous option decoders in `effect.ts` and `service-instrumentation.ts` are
required by Oxlint's `create` callback and throw only for invalid configuration.
The `syntax.ts` child adapter selects nodes from Oxlint's already parsed tree
using its visitor keys; it is not a decoder for external JSON. Traversal cycle
checks compare host nodes and variables by reference, never structural equality. Native nullable
syntax fields stay at this host boundary. There is no Effect runtime, service
or infrastructure stack inside the package.

The strict Effect rules were adapted from Cooper's DAW rules at `e47ecfb` and
subsequent Commonplace rules. The package's MIT licence covers this lint code.

## Keep address ownership precise

`strict-effect/public-host-literals` can check test setup without replacing
independent expected values with the implementation under test:

```ts
"strict-effect/public-host-literals": ["error", {
  hosts: ["example.com"],
  allowedFiles: ["packages/platform/src/site-address.ts"],
  allowedDeclarations: [{
    file: "packages/platform/src/site-address.ts",
    names: ["siteHostName"],
  }],
  allowTestFiles: false,
  allowTestAssertions: true,
}]
```

The named top-level `const` declaration owns the literal hostname. Derive
`api` and `www` hostnames from it; use native deployment outputs for actual
stage-specific origins. Files with a declaration restriction do not gain a
whole-file exemption. Declaration entries cannot grant ownership to a file
absent from `allowedFiles`. Existing configurations without these optional
settings keep their previous behaviour.

The assertion exception permits recognised imported Vitest or `@effect/vitest`
assertions' direct expected arguments, including static arrays and objects.
It does not trace table-driven expected values through variables or callbacks;
keep those oracles in narrowly configured declarations or use a local
suppression explaining their role. It does
not exempt their actual arguments, setup values, constructors, arbitrary calls
or shadowed assertion names. A test using unrecognised assertion helpers can
keep an explicit, narrowly scoped lint suppression with its reason. The rule
checks written literal text; it cannot prove the value of arbitrary computed
strings or that a configured canonical owner is semantically correct.

## Separate compiler assertions from runtime tests

The `effect` group enables `strict-effect/no-runtime-type-assertions`. It rejects
calls to imported Vitest or `@effect/vitest` `expectTypeOf` and `assertType` in
`.test.*` and `.spec.*` files. Aliases and namespace imports are recognised;
unrelated or shadowed local functions are not treated as Vitest APIs.

Move these checks into the existing TypeScript flow, for example
`inference.typecheck.ts`, or a configured Vitest `.test-d.ts` file. Include those
files in the compiler project and preserve negative brand/readonly assertions.
Do not create runtime services or registries only to feed a type assertion.
This syntax rule does not prove that the receiving compiler configuration
includes the destination file.

## Register one owner for a prohibition

`package/no-redundant-rule-registrations` is opt-in. Configure pairs only after
checking that the owner covers the redundant rule under the receiving project's
options and file scopes:

```ts
"package/no-redundant-rule-registrations": ["error", {
  pairs: [{ owner: "effect/no-throw", redundant: "legacy/no-throw" }],
}]
```

Those identifiers are illustrative consumer rules, not bundled equivalences.
The check reports when both members are statically enabled in the same Oxlint
`rules` object. Disabled owners do not establish redundancy. Separate overrides
are checked independently. An opaque spread or dynamic key clears preceding
known registrations; later explicit keys can establish them again. Imported or
spread contents still require effective-configuration review. Keep negative fixtures that
assert the intended diagnostic once and the redundant diagnostic is absent.
There is no automatic fix: removing a registration needs coverage evidence.
