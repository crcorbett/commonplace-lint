import { defineRule } from "@oxlint/plugins";
import type { Context, ESTree } from "@oxlint/plugins";
import { Array, Option } from "effect";
import { memberName, returns } from "../conventions/shared.js";
import { valueOf } from "../native-reference.js";
import { propertyName } from "../syntax.js";
import { effectModule, stringLiteral } from "./syntax.js";

const startupTags = ["ConfigError", "SchemaError"];
const successes = ["succeed", "succeedSome", "succeedNone", "sync", "void"];

const tags = (node: ESTree.Node): readonly string[] => {
  if (node.type === "ArrayExpression")
    return Array.flatMap(node.elements, (element) =>
      Option.toArray(Option.fromNullishOr(element).pipe(Option.flatMap(stringLiteral))),
    );
  return Option.toArray(stringLiteral(node));
};

const success = (context: Context, node: ESTree.Node): boolean => {
  const target = node.type === "CallExpression" ? node.callee : node;
  return memberName(context, target, effectModule).pipe(
    Option.exists((name) => Array.contains(successes, name)),
  );
};

// Follows a local handler constant; opaque or imported handlers are not judged.
const recovers = (context: Context, handler: ESTree.Node) =>
  valueOf(context, handler).pipe(
    Option.exists((value) => Array.some(returns(value), (result) => success(context, result))),
  );

export const noConfigErrorFallback = defineRule({
  meta: {
    type: "problem",
    docs: {
      description: "Fail on missing or invalid configuration instead of recovering with a success.",
    },
    messages: {
      fallback:
        "This handler turns a {{tag}} into a successful value, hiding missing or invalid configuration. Let the startup Effect fail, or map the failure to one named startup error. Use Config.withDefault or Config.option inside the Config description for a genuinely optional setting.",
    },
  },
  create(context) {
    const report = (handler: ESTree.Node, tag: string) => {
      if (recovers(context, handler))
        context.report({ node: handler, messageId: "fallback", data: { tag } });
    };
    return {
      CallExpression(node) {
        const name = memberName(context, node.callee, effectModule);
        if (Option.contains(name, "catchTag")) {
          Array.findFirstIndex(node.arguments, (argument) => tags(argument).length > 0).pipe(
            Option.map((index) => {
              const caught = Array.flatMap(Option.toArray(Array.get(node.arguments, index)), tags);
              const tag = Array.findFirst(caught, (entry) => entry === "ConfigError");
              const handler = Array.get(node.arguments, index + 1);
              Option.map(Option.all([tag, handler]), ([found, value]) => report(value, found));
            }),
          );
          return;
        }
        if (!Option.contains(name, "catchTags")) return;
        Array.findLast(node.arguments, (argument) => argument.type === "ObjectExpression").pipe(
          Option.map((table) => {
            if (table.type !== "ObjectExpression") return;
            const handlers = Array.flatMap(table.properties, (property) =>
              property.type === "Property" && !property.computed
                ? Option.toArray(
                    propertyName(property.key).pipe(
                      Option.filter((key) => Array.contains(startupTags, key)),
                      Option.map((key) => ({ key, value: property.value })),
                    ),
                  )
                : [],
            );
            if (Array.some(handlers, ({ key }) => key === "ConfigError"))
              Array.forEach(handlers, ({ key, value }) => report(value, key));
          }),
        );
      },
    };
  },
});
