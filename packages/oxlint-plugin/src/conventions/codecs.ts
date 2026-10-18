import { Option } from "effect";
import { memberName, report, rule } from "./shared.js";

const decoder = /^decode(?:Unknown)?(?:Effect|Promise|Sync|Option|Result|Exit|Either|Unknown)?$/u;
const encoder = /^encode(?:Unknown)?(?:Effect|Promise|Sync|Option|Result|Exit|Either|Unknown)?$/u;
const synchronous = /(?:Option|Result|Exit|Either)$/u;

export const codecRules = {
  "no-schema-decoder-outside-ingress": rule(
    "Decode raw input once at an explicitly configured ingress owner.",
    (context) => ({
      CallExpression(node) {
        if (
          memberName(context, node.callee, "effect/Schema").pipe(
            Option.exists((name) => decoder.test(name)),
          )
        )
          report(context, node);
      },
    }),
  ),
  "no-schema-encoder-outside-egress": rule(
    "Encode checked values only at an explicitly configured outward boundary.",
    (context) => ({
      CallExpression(node) {
        if (
          memberName(context, node.callee, "effect/Schema").pipe(
            Option.exists((name) => encoder.test(name)),
          )
        )
          report(context, node);
      },
    }),
  ),
  "no-sync-decoder-outside-consumer": rule(
    "Non-throwing synchronous decoding belongs to an explicit synchronous host consumer.",
    (context) => ({
      CallExpression(node) {
        if (
          memberName(context, node.callee, "effect/Schema").pipe(
            Option.exists((name) => decoder.test(name) && synchronous.test(name)),
          )
        )
          report(context, node);
      },
    }),
  ),
  "no-throwing-schema-codec": rule(
    "Use Effect codecs and typed errors instead of throwing synchronous Schema codecs.",
    (context) => ({
      CallExpression(node) {
        if (
          memberName(context, node.callee, "effect/Schema").pipe(
            Option.exists((name) => name.endsWith("Sync") && !synchronous.test(name)),
          )
        )
          report(context, node);
      },
    }),
  ),
};
