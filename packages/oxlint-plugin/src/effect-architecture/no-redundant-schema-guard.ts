import { defineRule } from "@oxlint/plugins";
import type { Context, ESTree } from "@oxlint/plugins";
import { Array, Option } from "effect";
import { isFunction, memberName } from "../conventions/shared.js";
import { variableInScope } from "../syntax.js";
import {
  called,
  curried,
  discriminants,
  effectModule,
  isArgument,
  matchModule,
  stringLiteral,
} from "./syntax.js";

const schemaModule = "effect/Schema";

const tagSpecifier = (node: ESTree.Node) =>
  Option.isSome(stringLiteral(node)) ||
  (node.type === "ArrayExpression" &&
    node.elements.length > 0 &&
    Array.every(node.elements, (element) =>
      Option.isSome(Option.flatMap(Option.fromNullishOr(element), stringLiteral)),
    ));

// The callback receives a value already narrowed by a literal or tag.
const discriminatedHandler = (context: Context, handler: ESTree.Node): boolean => {
  const parent = handler.parent;
  if (parent?.type === "CallExpression")
    return (
      Array.last(parent.arguments).pipe(Option.exists((last) => last === handler)) &&
      (Option.isSome(discriminants(context, parent)) ||
        (Option.contains(memberName(context, parent.callee, effectModule), "catchTag") &&
          Array.some(parent.arguments, tagSpecifier)))
    );
  if (parent?.type !== "Property" || parent.value !== handler) return false;
  const table = parent.parent;
  const call = table.parent;
  if (
    table.type !== "ObjectExpression" ||
    call?.type !== "CallExpression" ||
    !isArgument(call, table)
  )
    return false;
  const name = memberName(context, call.callee, matchModule);
  return (
    Option.isSome(discriminants(context, call)) ||
    Option.contains(name, "valueTags") ||
    Option.contains(name, "typeTags") ||
    Option.contains(curried(context, call, matchModule), "valueTags") ||
    Option.contains(memberName(context, call.callee, effectModule), "catchTags")
  );
};

const decoded = (context: Context, node: ESTree.Node | null | undefined): boolean => {
  if (!node) return false;
  if (node.type === "YieldExpression") return decoded(context, node.argument);
  return (
    node.type === "CallExpression" &&
    Option.exists(called(context, node.callee, schemaModule), (name) => name.startsWith("decode"))
  );
};

export const noRedundantSchemaGuard = defineRule({
  meta: {
    type: "problem",
    docs: {
      description: "Do not re-check values whose Schema type a tag match or decode already proves.",
    },
    messages: {
      branch:
        "This value was already narrowed by a literal or tag match. Use its narrowed type, or add a Match.tag/Match.when case for the variant, instead of checking it again with Schema.is.",
      decoded:
        "This value was produced by a Schema decode and is already typed. Discriminate decoded unions with Match.tag or Match.when on their discriminant instead of re-validating them with Schema.is.",
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        if (
          node.callee.type !== "CallExpression" ||
          !Option.contains(memberName(context, node.callee.callee, schemaModule), "is")
        )
          return;
        Array.head(node.arguments).pipe(
          // Only the narrowed value itself: nested fields may still be unknown causes.
          Option.flatMap((subject) =>
            subject.type === "Identifier" ? Option.some(subject) : Option.none(),
          ),
          Option.flatMap((root) =>
            variableInScope(context.sourceCode.getScope(root), root.name).pipe(
              Option.filter((variable) =>
                Array.every(variable.references, (entry) => !entry.isWrite() || entry.init),
              ),
              Option.flatMap((variable) => Array.head(variable.defs)),
            ),
          ),
          Option.map((definition) => {
            if (
              definition.type === "Parameter" &&
              isFunction(definition.node) &&
              Array.head(definition.node.params).pipe(
                Option.exists((first) => first === definition.name),
              ) &&
              discriminatedHandler(context, definition.node)
            )
              context.report({ node, messageId: "branch" });
            if (
              definition.node.type === "VariableDeclarator" &&
              definition.parent?.type === "VariableDeclaration" &&
              definition.parent.kind === "const" &&
              decoded(context, definition.node.init)
            )
              context.report({ node, messageId: "decoded" });
          }),
        );
      },
    };
  },
});
