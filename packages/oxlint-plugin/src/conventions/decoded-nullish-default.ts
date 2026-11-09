import type { ESTree } from "@oxlint/plugins";
import { Array, Option, Predicate } from "effect";
import { report, rule, testFile } from "./shared.js";

const emptyDefault = (node: ESTree.Node) =>
  (node.type === "ArrayExpression" && node.elements.length === 0) ||
  (node.type === "ObjectExpression" && node.properties.length === 0) ||
  (node.type === "Literal" && Predicate.isString(node.value) && node.value === "") ||
  (node.type === "TemplateLiteral" &&
    node.expressions.length === 0 &&
    node.quasis.length === 1 &&
    Array.head(node.quasis).pipe(Option.exists((quasi) => quasi.value.raw === "")));

// Property reads are the shape of optional decoded fields. Calls, locals and
// test files are outside this syntax check; it cannot see Schema definitions.
const propertyRead = (node: ESTree.Node): boolean =>
  (node.type === "MemberExpression" && (!node.computed || node.property.type === "Literal")) ||
  (node.type === "ChainExpression" && propertyRead(node.expression));

export const noDecodedNullishDefault = rule(
  "Do not invent an empty default when reading an optional field. Give the owning Schema field Schema.withDecodingDefaultKey(Effect.succeed(...)) or Schema.withDecodingDefault so decoding supplies the value once, or keep absence explicit with Option.",
  (context) =>
    testFile(context.filename)
      ? {}
      : {
          LogicalExpression(node) {
            if (node.operator === "??" && emptyDefault(node.right) && propertyRead(node.left))
              report(context, node);
          },
        },
);
