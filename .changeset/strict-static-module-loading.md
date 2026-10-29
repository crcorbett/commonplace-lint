---
"@commonplaces/oxlint-plugin": minor
---

Reject dynamic `import()` expressions with `strict-effect/no-promise-workflow`,
including inside `Effect.tryPromise` and explicitly permitted host or SDK adapters.
Static imports and TypeScript-only import types remain valid. Consumers must replace
runtime imports with static imports before adopting this stricter policy; Effect
and Atom can still defer service initialisation and manage its lifetime.
