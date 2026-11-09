# Upgrading

Each release that adds or enables a rule must add a section here before its
Changeset merges. Name every new rule family with its full `prefix/name`, say
which presets enable it and say how to fix existing code. The repository check
fails when a pending Changeset names a rule that this page does not mention.

Consumers that track `latest` should read the sections between their last
checked version and the new one, then run the [doctor](../packages/oxlint-plugin/README.md#lint-doctor)
and their normal lint command. Fix the code; do not disable a new rule to get a
green result.

## Next release

### New rules

- `web/no-colour-literals` (style preset). Reports hex (`#2563eb`, `#fff` in a
  style context) and functional colours (`rgb()`, `rgba()`, `hsl()`, `oklch()`
  and similar) in TypeScript and JSX string literals. Move the value into a token
  or theme file and read it through a CSS variable or token import. Files whose
  path matches `**/*tokens*` or `**/*theme*` own colours by default; set
  `allowedFiles` globs to name other owners. Oxlint does not lint `.css` files,
  so stylesheet colours still need review against the design skill guidance.
- `package/no-cross-app-source-paths` (strict, through the new `structure`
  group). Reports strings in `apps/<a>/` that point into `apps/<b>/src`, such as
  `path.join(root, "apps/api/src/worker.ts")` or
  `new URL("../../api/src/worker.ts", import.meta.url)`. Test the other app
  through its public package export, its built output or a shared fixture owner.
  Configure `apps` patterns for another layout and exact `allowedFiles` for a
  reviewed exception.
- `package/no-duplicated-owned-literals` (opt-in). Configure `ownedLiterals`
  with each value, its owner module and exact owner files. Replace each copy
  with an import of the owner's value.

### Newly enabled in strict

- `strict-effect/http-client-ownership`. Without options, every
  `FetchHttpClient.layer`, `RequestInit` or `Fetch` use fails. Name the client
  Layer owners in `allowedFiles` and import their Layer elsewhere.
- `strict-effect/no-owner-paths-in-rules`. Without options it checks only lint
  rule modules (files importing `@oxlint/plugins`) for `apps/` and `packages/`
  file paths. Pass owner paths as rule options instead of writing them in rule
  code or messages.
- `strict-effect/shared-schema-owner` stays opt-in: it reports missing owners
  instead of skipping, and its owners are project facts.

## 0.11.0

Upgrading from 0.9 or earlier also brings in the 0.10.0 Atom rule.

- `effect/no-redundant-operation-wrappers` (effect and strict). Reports an
  `Effect.fn` or `Effect.withSpan` that only forwards to an already traced
  operation or an acquired service method with unchanged arguments. Call the
  traced operation directly; its span already names the work. Keep a wrapper
  only when it adds behaviour such as argument translation, extra workflow steps
  or a timeout/retry pipeline.
- `effect/no-service-decorators` (effect and strict). Reports a `Layer.effect`
  that acquires a service and rebuilds the same service around it, for example
  to add analytics or metrics. Put that behaviour in the normal implementation
  and inject its dependencies through Layers. Identity projections and distinct
  read/write capabilities remain valid.
- `effect/require-service-operation-instrumentation` (effect and strict, now
  without a `serviceNames` inventory). Every operation in a native
  `Context.Service`, `.of`, `Layer.effect`/`Layer.succeed` record and
  `Layer.mock` replacement needs its exact span: write
  `Effect.fn("Orders.create")` or pipe through `Effect.withSpan("Orders.create")`.
  Nested resource groups need the full name, such as `Orders.session.read`.
  Declare members as explicit named properties so they can be checked.
- `strict-effect/static-atoms` (effect and strict, added in 0.10.0). Reports
  functions that return a new Atom, including `runtime.atom(...)` built from an
  injected runtime. Declare one static Atom, supply configuration through input
  Atoms and the registry's `initialValues`, and use a static `Atom.family` for
  keyed definitions.
