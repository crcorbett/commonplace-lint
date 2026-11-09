---
"@commonplaces/oxlint-plugin": minor
---

Add `web/no-colour-literals` to the style preset, `package/no-cross-app-source-paths`
and the opt-in `package/no-duplicated-owned-literals`. Add a `structure` group to
`strict` that enables `strict-effect/http-client-ownership`,
`strict-effect/no-owner-paths-in-rules` (rule modules only without options) and
`package/no-cross-app-source-paths`. Ship the `commonplace-lint-doctor` command,
which reports a pinned or unrefreshed plugin, local rules that repeat preset rules
and missing configured paths. See docs/upgrading.md for fixes.
