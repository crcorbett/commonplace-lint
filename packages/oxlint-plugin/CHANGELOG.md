# @commonplaces/oxlint-plugin

## 0.2.0

### Minor Changes

- Add manifest-driven workspace import boundaries and native Effect subprocess pipe capture checks. The workspace rule checks public exports and configured dependency direction without embedding consumer paths. The subprocess rule catches statically known sequential pipe collection while preserving safe concurrent collection. Qualify installed archives with Oxlint 1.86.0 as well as 1.80.0 and 1.85.0.

## 0.1.2

### Patch Changes

- Release the existing 57 rules through GitHub Actions trusted publishing. Rule behaviour and configuration are unchanged.

## 0.1.1

### Patch Changes

- Rename the package to @commonplaces/oxlint-plugin, the npm organisation owned by its maintainer. Update preset imports and release checks to use the new name.
