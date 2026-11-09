---
"@commonplaces/oxlint-plugin": minor
---

Add six Effect architecture checks to the `effect` and `strict` presets:
`strict-effect/no-layer-parameters-in-service-contracts`,
`strict-effect/no-layer-construction-in-operations`,
`strict-effect/exhaustive-closed-union-match`,
`strict-effect/no-redundant-schema-guard`,
`strict-effect/no-generic-error-mapper` and
`strict-effect/no-config-error-fallback`. Add
`effect-conventions/no-decoded-nullish-default` to the `conventions` and `strict`
presets, rejecting `?? []`, `?? {}` and `?? ""` on property reads in favour of
`Schema.withDecodingDefaultKey`. `web/no-context-nullish-default` now suggests
the same Schema-owned default. Existing code that matches these patterns will
newly fail; the package README's migration notes describe each fix.
