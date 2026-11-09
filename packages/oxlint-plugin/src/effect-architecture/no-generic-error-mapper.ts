import { defineRule } from "@oxlint/plugins";
import type { Context, ESTree } from "@oxlint/plugins";
import { Array, Option } from "effect";
import { contains, memberName } from "../conventions/shared.js";
import { variableInScope } from "../syntax.js";
import { curried, rootIdentifier } from "./syntax.js";

type FunctionNode = ESTree.ArrowFunctionExpression | ESTree.Function;
const predicateModule = "effect/Predicate";
const probes = ["hasProperty", "isTagged"];

// Parameters whose whole type is one of the function's own type parameters.
const genericParameters = (node: FunctionNode): readonly ESTree.BindingIdentifier[] => {
  const names = Array.map(node.typeParameters?.params ?? [], (parameter) => parameter.name.name);
  return Array.filter(
    Array.flatMap(node.params, (parameter): readonly ESTree.BindingIdentifier[] =>
      parameter.type === "Identifier" ? [parameter] : [],
    ),
    (parameter) => {
      const type = parameter.typeAnnotation?.typeAnnotation;
      return (
        type?.type === "TSTypeReference" &&
        type.typeName.type === "Identifier" &&
        Array.contains(names, type.typeName.name)
      );
    },
  );
};

const refersTo = (context: Context, node: ESTree.Node, parameter: ESTree.BindingIdentifier) =>
  rootIdentifier(node).pipe(
    Option.flatMap((root) => variableInScope(context.sourceCode.getScope(root), root.name)),
    Option.flatMap((variable) => Array.head(variable.defs)),
    Option.exists((definition) => definition.name === parameter),
  );

const probe = (context: Context, node: ESTree.Node, parameter: ESTree.BindingIdentifier) => {
  if (node.type === "BinaryExpression")
    return node.operator === "in" && refersTo(context, node.right, parameter);
  if (node.type !== "CallExpression") return false;
  const name = memberName(context, node.callee, predicateModule).pipe(
    Option.orElse(() => curried(context, node, predicateModule)),
  );
  return (
    Option.exists(name, (value) => Array.contains(probes, value)) &&
    Array.head(node.arguments).pipe(
      Option.exists((argument) => refersTo(context, argument, parameter)),
    )
  );
};

export const noGenericErrorMapper = defineRule({
  meta: {
    type: "problem",
    docs: {
      description: "Do not classify errors by probing an unconstrained type parameter at runtime.",
    },
    messages: {
      generic:
        "This generic mapper probes a type parameter with Predicate.hasProperty, Predicate.isTagged or `in`, discarding the typed error union. Recover the known tags with Effect.catchTags or Match.tags on the typed union instead.",
    },
  },
  create(context) {
    const inspect = (node: FunctionNode) => {
      if (node.body === null) return;
      const body = node.body;
      if (
        Array.some(genericParameters(node), (parameter) =>
          contains(context, body, (entry) => probe(context, entry, parameter)),
        )
      )
        context.report({ node, messageId: "generic" });
    };
    return {
      ArrowFunctionExpression: inspect,
      FunctionDeclaration: inspect,
      FunctionExpression: inspect,
    };
  },
});
