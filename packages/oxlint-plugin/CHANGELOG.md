# @commonplaces/oxlint-plugin

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
