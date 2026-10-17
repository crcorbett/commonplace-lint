# @commonplaces/oxlint-plugin

61 custom Oxlint rules for strict Effect TypeScript, Alchemy and general code
checks. This package supports **Oxlint 1.80.0, 1.85.0 or 1.86.0** and **Node 22.14 or newer**.
Oxlint's JavaScript plugin API is experimental, so upgrade it only after running
the rule tests. The development tools use 1.80.0; consuming projects may use any supported version.
All three exact versions are checked with independently installed archives. ESLint is not a supported host.

## Install

Install the latest npm release and save its exact version:

```sh
npm install --save-dev --save-exact @commonplaces/oxlint-plugin@latest oxlint@1.80.0
```

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

The root export contains these three configurations. Individual plugins use
the subpaths below. For example, a JSON configuration can enable one rule:

```json
{
  "jsPlugins": ["@commonplaces/oxlint-plugin/strict-effect"],
  "rules": { "strict-effect/static-layers": "error" }
}
```

## Project settings

Rules that refer to project files, services, schemas or routes are available
but excluded from the groups. Configure them explicitly, for example:

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
everywhere unless `allowedFiles` grants an entry file. The service tracing rule
requires `serviceNames` and checks names such as `Effect.fn("Orders.create")`.
Invalid settings stop linting. Each rule's exported `meta.schema` describes its
accepted options; no marketplace plugin is needed to read or run them.

The portable Effect checks use the existing `strict-effect/` names, and the
Alchemy checks use `alchemy-secrets/`. Keep those names when moving from copied
rule files. Remove the copied implementations and change `jsPlugins` to the
package subpaths; keep your existing rule settings.

## Rule exports

| Package subpath     | Rule prefix         | Rules |
| ------------------- | ------------------- | ----: |
| `/strict-effect`    | `strict-effect/`    |    29 |
| `/effect`           | `effect/`           |     9 |
| `/alchemy`          | `alchemy-secrets/`  |     3 |
| `/bun`              | `bun/`              |     1 |
| `/package`          | `package/`          |     3 |
| `/anti-slop`        | `anti-slop/`        |    15 |
| `/anti-slop-effect` | `anti-slop-effect/` |     1 |

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
Effect collections. The two synchronous option decoders in `effect.ts` are
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
