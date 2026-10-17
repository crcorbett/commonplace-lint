# @commonplaces/oxlint-plugin

59 custom Oxlint rules for strict Effect TypeScript, Alchemy and general code
checks. This package supports **Oxlint 1.80.0, 1.85.0 or 1.86.0** and **Node 22.14 or newer**.
Oxlint's JavaScript plugin API is experimental, so upgrade it only after running
the rule tests. The development tools use 1.80.0; consuming projects may use any supported version.
All three exact versions are checked with independently installed archives. ESLint is not a supported host.

## Install

Install from npm:

```sh
npm install --save-dev --save-exact @commonplaces/oxlint-plugin@0.2.0 oxlint@1.80.0
```

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
| `/strict-effect`    | `strict-effect/`    |    28 |
| `/effect`           | `effect/`           |     9 |
| `/alchemy`          | `alchemy-secrets/`  |     3 |
| `/bun`              | `bun/`              |     1 |
| `/package`          | `package/`          |     2 |
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
