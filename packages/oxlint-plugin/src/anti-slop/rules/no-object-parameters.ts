import { Array, HashMap, Option } from "effect";
import { createTypeEnvironment } from "../shared/dictionary-types.js";
import { defineRule } from "@oxlint/plugins";

import type { ESTree, SourceCode } from "@oxlint/plugins";

import { lexicalTypeParameterNames } from "../shared/lexical-type-parameters.js";

type Parameter = ESTree.ParamPattern;
type ParameterOwner =
  | ESTree.ArrowFunctionExpression
  | ESTree.Function
  | ESTree.TSCallSignatureDeclaration
  | ESTree.TSConstructSignatureDeclaration
  | ESTree.TSConstructorType
  | ESTree.TSFunctionType
  | ESTree.TSMethodSignature;

function parameterAnnotation(parameter: Parameter): ESTree.TSTypeAnnotation | null | undefined {
  if (parameter.type === "TSParameterProperty") {
    return parameterAnnotation(parameter.parameter);
  }
  if (parameter.type === "RestElement") {
    return parameter.typeAnnotation ?? parameterAnnotation(parameter.argument);
  }
  if (parameter.type === "AssignmentPattern") {
    return parameter.typeAnnotation ?? parameter.left.typeAnnotation;
  }
  return parameter.typeAnnotation;
}

function parameterName(parameter: Parameter, sourceCode: SourceCode): string {
  return parameter.type === "Identifier"
    ? parameter.name
    : sourceCode.getText(parameter).replace(/\s*:\s*object\s*$/u, "");
}

/** Ban the broad object type on function inputs, including local aliases to object. */
export const noObjectParametersRule = defineRule({
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow object function parameters; inputs must use an owner-provided type and be parsed at their boundary.",
    },
    messages: {
      objectParameter:
        "Parameter `{{parameter}}` uses the broad `object` type. Accept a named owner type; parse external input at its boundary before calling this function.",
    },
  },
  create(context) {
    const aliases = createTypeEnvironment(context.sourceCode.ast).aliases;

    const resolvesToObject = (
      type: ESTree.TSType,
      shadowedAliases: readonly string[],
      visited: readonly string[] = [],
    ): boolean => {
      if (type.type === "TSObjectKeyword") return true;
      if (type.type === "TSParenthesizedType")
        return resolvesToObject(type.typeAnnotation, shadowedAliases, visited);
      if (type.type === "TSUnionType") {
        return Array.some(type.types, (member) =>
          resolvesToObject(member, shadowedAliases, visited),
        );
      }
      if (
        type.type !== "TSTypeReference" ||
        type.typeName.type !== "Identifier" ||
        (type.typeArguments !== null &&
          type.typeArguments !== undefined &&
          type.typeArguments.params.length > 0) ||
        Array.contains(visited, type.typeName.name) ||
        Array.contains(shadowedAliases, type.typeName.name)
      ) {
        return false;
      }
      const alias = Option.getOrUndefined(HashMap.get(aliases, type.typeName.name));
      if (alias === undefined || alias.typeParameters != null) return false;
      const nextVisited = [...visited, type.typeName.name];
      return resolvesToObject(alias.typeAnnotation, shadowedAliases, nextVisited);
    };

    const checkParameters = (node: ParameterOwner) => {
      const shadowedAliases = lexicalTypeParameterNames(node, context);
      Array.forEach(node.params, (parameter) => {
        const annotation = parameterAnnotation(parameter);
        if (annotation === null || annotation === undefined) return;
        if (!resolvesToObject(annotation.typeAnnotation, shadowedAliases)) return;
        context.report({
          node: annotation.typeAnnotation,
          messageId: "objectParameter",
          data: { parameter: parameterName(parameter, context.sourceCode) },
        });
      });
    };

    return {
      ArrowFunctionExpression: checkParameters,
      FunctionDeclaration: checkParameters,
      FunctionExpression: checkParameters,
      TSCallSignatureDeclaration: checkParameters,
      TSConstructSignatureDeclaration: checkParameters,
      TSConstructorType: checkParameters,
      TSDeclareFunction: checkParameters,
      TSEmptyBodyFunctionExpression: checkParameters,
      TSFunctionType: checkParameters,
      TSMethodSignature: checkParameters,
    };
  },
});
