# @commonplaces/oxlint-plugin

## 0.9.1

### Patch Changes

- Validate canonical spans at every leaf of nested service resource groups,
  including immutable aliases and Layer.mock implementations. Reject empty,
  cyclic and opaque groups without exempting uninstrumented operations.

## 0.9.0

### Minor Changes

- Support Oxlint 1.90.0 alongside 1.88.0 and 1.89.0. Update the Oxlint plugin SDK
  to 1.90.0, the native Effect checker to 0.63.0 and oxlint-tsgolint to 7.0.2005.
  Remove Oxlint 1.87.0 support because the native Effect checker no longer ships
  that host. Consumers on 1.87.0 must upgrade before adopting this release; native
  Effect correctness checks remain required on every supported version.

## 0.8.0

### Minor Changes

- 188c3d7: Reject dynamic `import()` expressions with `strict-effect/no-promise-workflow`,
  including inside `Effect.tryPromise` and explicitly permitted host or SDK adapters.
  Static imports and TypeScript-only import types remain valid. Consumers must replace
  runtime imports with static imports before adopting this stricter policy; Effect
  and Atom can still defer service initialisation and manage its lifetime.

## 0.7.0

### Minor Changes

- Add `strict-effect/http-client-error-classification` to the Effect configuration.
  Reject unconditional HTTP DecodeError mappings to a different domain error from
  TransportError: Effect uses DecodeError for failed response-body reads as well as
  payload decoding. Keep separately tagged payload failures distinguishable by cause.

## 0.6.2

### Patch Changes

- Recognise Alchemy beta.84 provider imports when checking Doppler secret source order, portable contracts and service instrumentation, while retaining support for earlier Alchemy releases.

## 0.6.1

### Patch Changes

- Document Effect's automatic root prepare script for both TypeScript and Oxlint.
  Keep existing prepare tasks and strict rule settings. Qualify the actual archive
  with a normal install that runs prepare and prove the patched compiler catches
  forgotten Effect work.

## 0.6.0

### Minor Changes

- Include all 26 native Effect correctness checks as errors in the effect and
  strict groups, with type-aware checking enabled. Ship pinned @effect/tsgo and
  oxlint-tsgolint dependencies. Consumers must run
  `effect-tsgo patch --no-typescript --oxlint` after installation. Support exactly
  Oxlint 1.87.0, 1.88.0 and 1.89.0; the native checker does not support 1.86.0.

  Add strict-effect/no-copying-accumulator. Reject repeated accumulator spreads and
  copying Effect Array/Record operations, while allowing persistent Chunk,
  HashMap and HashSet updates. Recommend immutable alternatives without suggesting
  mutation. Use persistent collections for the package's own path and property
  accumulation.

### Patch Changes

- Stop the optional Ultracite style preset asking for async/await, loops, mutation,
  native APIs, type assertions or ternaries that strict Effect code forbids. Allow
  related Schema error and service classes to share a module. Keep strict checks
  active and accept Effect's two-argument curried reduce while still rejecting its
  three-argument data-first form.

## 0.5.0

### Minor Changes

- Add a separate optional `style` preset using Ultracite 8.0.1 core, React and
  Vitest, with eleven shared Site/Common Practice overrides. Extend
  `[style, strict, project]` to retain strict safety checks. Keep strict unchanged
  and preserve strict correctness settings through documented configuration adjustments.
- Update all direct dependencies to their latest releases. Use Oxlint and its SDK
  1.89.0, Effect linting 0.55.0, Effect 4.0.5, Oxfmt 0.74.0 and Bun 1.4.3.
  Qualify Oxlint 1.86.0 and 1.89.0; retire 1.80.0 and 1.85.0 because Ultracite 8
  requires a newer host.

## 0.4.1

### Patch Changes

- `strict-effect/static-layers` now reports owned factories that return a Layer from a completed `Match.value` pipeline (`Match.orElse` or `Match.exhaustive`). Inline Match callbacks passed to native composition remain allowed.

## 0.4.0

### Minor Changes

- Add optional Effect convention, web and native TypeScript configuration groups,
  with portable codec, runtime, HTTP-client and build-memo ownership checks.
  Enable automatic service-operation tracing with canonical imported names, mixed
  data/Stream contracts and validation that spans wrap returned operations.
  Reject relative imports across workspace boundaries even outside source folders.

## 0.3.1

### Patch Changes

- Honour explicit native subprocess options when command arguments are conditional, preserving detection of exit waits before captured stdout drains. Correct the packaged npm installation instructions.

## 0.3.0

### Minor Changes

- Add manifest-driven workspace import boundaries and native Effect subprocess pipe capture checks. The workspace rule checks public exports and configured dependency direction without embedding consumer paths. The subprocess rule catches statically known sequential pipe collection while preserving safe concurrent collection. Qualify installed archives with Oxlint 1.86.0 as well as 1.80.0 and 1.85.0.

## 0.2.0

### Minor Changes

- Keep type-only Vitest assertions out of runtime test files, detect explicitly configured redundant Oxlint rule registrations, and support declaration-level hostname ownership with literal assertion expectations. Preserve existing hostname-rule options and document conservative syntax-analysis limits.

## 0.1.2

### Patch Changes

- Release the existing 57 rules through GitHub Actions trusted publishing. Rule behaviour and configuration are unchanged.

## 0.1.1

### Patch Changes

- Rename the package to @commonplaces/oxlint-plugin, the npm organisation owned by its maintainer. Update preset imports and release checks to use the new name.
