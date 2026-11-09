import { defineRule } from "@oxlint/plugins";
import type { Context, ESTree } from "@oxlint/plugins";
import { Array, Number, Option } from "effect";
import { memberName } from "../conventions/shared.js";
import { referenceOf } from "../native-reference.js";
import { propertyName } from "../syntax.js";
import { called, discriminants, matchModule } from "./syntax.js";

const matchInput = (context: Context, node: ESTree.Node) =>
  Option.exists(called(context, node, matchModule), (name) => name === "value" || name === "type");

const pipeFunction = (context: Context, node: ESTree.Node) =>
  referenceOf(context, node).pipe(
    Option.exists(
      (reference) =>
        reference.module === "effect/pipe" ||
        (reference.module === "effect/Function" && Option.contains(reference.name, "pipe")),
    ),
  );

/** The case steps of `Match.value(x).pipe(...)` or `pipe(Match.value(x), ...)`. */
const matchSteps = (
  context: Context,
  node: ESTree.CallExpression,
): Option.Option<readonly ESTree.Node[]> => {
  if (
    node.callee.type === "MemberExpression" &&
    Option.contains(propertyName(node.callee.property), "pipe") &&
    matchInput(context, node.callee.object)
  )
    return Option.some(node.arguments);
  if (!pipeFunction(context, node.callee)) return Option.none();
  return Array.head(node.arguments).pipe(
    Option.filter((input) => matchInput(context, input)),
    Option.map(() => Array.drop(node.arguments, 1)),
  );
};

const minimumCases = 2;

// Object patterns count only as one shared discriminant key, such as `_tag`.
// Partial multi-field patterns (`{ bold: true }`) rarely narrow to never.
const objectKeys = (step: ESTree.Node): readonly Option.Option<string>[] =>
  step.type === "CallExpression"
    ? Array.flatMap(Array.dropRight(step.arguments, 1), (pattern) =>
        pattern.type === "ObjectExpression"
          ? [
              pattern.properties.length === 1
                ? Array.head(pattern.properties).pipe(
                    Option.flatMap((property) =>
                      property.type === "Property" ? propertyName(property.key) : Option.none(),
                    ),
                  )
                : Option.none<string>(),
            ]
          : [],
      )
    : [];

const sharedDiscriminant = (cases: readonly ESTree.Node[]) => {
  const keys = Array.flatMap(cases, objectKeys);
  return Array.every(keys, Option.isSome) && Array.dedupe(Array.getSomes(keys)).length <= 1;
};

export const exhaustiveClosedUnionMatch = defineRule({
  meta: {
    type: "problem",
    docs: {
      description:
        "Finish literal and tag Match pipelines with Match.exhaustive rather than a silent fallback.",
    },
    messages: {
      exhaustive:
        "Every case in this Match discriminates a literal or tag, so the input is probably a closed union. End with Match.exhaustive so a new variant fails type checking instead of reaching this fallback. Keep Match.orElse only for a genuinely open input.",
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        Option.map(matchSteps(context, node), (steps) => {
          const fallback = Array.last(steps).pipe(
            Option.filter((step) =>
              Option.contains(
                step.type === "CallExpression"
                  ? memberName(context, step.callee, matchModule)
                  : Option.none(),
                "orElse",
              ),
            ),
          );
          const cases = Array.filter(
            Array.dropRight(steps, 1),
            (step) => !Option.contains(called(context, step, matchModule), "withReturnType"),
          );
          const counts = Array.map(cases, (step) => discriminants(context, step));
          if (
            Option.isSome(fallback) &&
            Array.every(counts, Option.isSome) &&
            sharedDiscriminant(cases) &&
            Number.sumAll(Array.getSomes(counts)) >= minimumCases
          )
            context.report({ node: fallback.value, messageId: "exhaustive" });
        });
      },
    };
  },
});
