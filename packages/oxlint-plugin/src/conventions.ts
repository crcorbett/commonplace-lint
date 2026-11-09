import { eslintCompatPlugin } from "@oxlint/plugins";
import { syntaxRules } from "./conventions/syntax.js";
import { contractRules } from "./conventions/contracts.js";
import { codecRules } from "./conventions/codecs.js";
import { lifetimeRules } from "./conventions/lifetimes.js";
import { browserRuntimeOwnership, nativeHttpClientOwnership } from "./conventions/ownership.js";
import { boundedBuildMemo } from "./conventions/bounded-build-memo.js";
import { noDecodedNullishDefault } from "./conventions/decoded-nullish-default.js";

export default eslintCompatPlugin({
  meta: { name: "effect-conventions" },
  rules: {
    ...syntaxRules,
    ...contractRules,
    ...codecRules,
    ...lifetimeRules,
    "browser-runtime-ownership": browserRuntimeOwnership,
    "native-http-client-ownership": nativeHttpClientOwnership,
    "bounded-build-memo": boundedBuildMemo,
    "no-decoded-nullish-default": noDecodedNullishDefault,
  },
});
