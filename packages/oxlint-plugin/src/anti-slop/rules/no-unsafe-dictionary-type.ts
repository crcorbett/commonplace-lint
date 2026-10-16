import { Array, HashMap } from "effect";
import { defineRule } from "@oxlint/plugins";

import {
  classifyUnsafeDictionary,
  classifyUnsafeDictionaryValue,
  createTypeEnvironment,
  type TypeEnvironment,
} from "../shared/dictionary-types.js";

import type { ESTree } from "@oxlint/plugins";

const typeNodeKinds: readonly string[] = [
  "JSDocNonNullableType",
  "JSDocNullableType",
  "JSDocUnknownType",
  "TSAnyKeyword",
  "TSArrayType",
  "TSBigIntKeyword",
  "TSBooleanKeyword",
  "TSConditionalType",
  "TSConstructorType",
  "TSFunctionType",
  "TSImportType",
  "TSIndexedAccessType",
  "TSInferType",
  "TSIntersectionType",
  "TSIntrinsicKeyword",
  "TSLiteralType",
  "TSMappedType",
  "TSNamedTupleMember",
  "TSNeverKeyword",
  "TSNullKeyword",
  "TSNumberKeyword",
  "TSObjectKeyword",
  "TSParenthesizedType",
  "TSStringKeyword",
  "TSSymbolKeyword",
  "TSTemplateLiteralType",
  "TSThisType",
  "TSTupleType",
  "TSTypeLiteral",
  "TSTypeOperator",
  "TSTypePredicate",
  "TSTypeQuery",
  "TSTypeReference",
  "TSUndefinedKeyword",
  "TSUnionType",
  "TSUnknownKeyword",
  "TSVoidKeyword",
];

function isTypeNode(node: ESTree.Node): node is ESTree.TSType {
  return Array.contains(typeNodeKinds, node.type);
}

function typeReferenceName(type: ESTree.TSTypeReference): string | null {
  return type.typeName.type === "Identifier" ? type.typeName.name : null;
}

function isInsideTypeAliasDeclaration(node: ESTree.Node): boolean {
  const current = node.parent;
  return (
    current !== null &&
    current.type !== "Program" &&
    (current.type === "TSTypeAliasDeclaration" || isInsideTypeAliasDeclaration(current))
  );
}

function isPlainAliasConsumerUse(node: ESTree.TSType, environment: TypeEnvironment): boolean {
  if (node.type !== "TSTypeReference" || node.typeArguments?.params.length) return false;
  const name = typeReferenceName(node);
  return (
    name !== null && HashMap.has(environment.aliases, name) && !isInsideTypeAliasDeclaration(node)
  );
}

function hasUnsafeParent(node: ESTree.Node | null, environment: TypeEnvironment): boolean {
  return (
    node !== null &&
    node.type !== "Program" &&
    ((isTypeNode(node) && classifyUnsafeDictionary(node, environment) !== null) ||
      hasUnsafeParent(node.parent, environment))
  );
}

function shouldReportType(node: ESTree.TSType, environment: TypeEnvironment): boolean {
  if (isPlainAliasConsumerUse(node, environment)) return false;
  if (classifyUnsafeDictionary(node, environment) === null) return false;
  return !hasUnsafeParent(node.parent, environment);
}

/** Disallow object-dictionary contracts whose direct value type is an unsafe escape hatch. */
export const noUnsafeDictionaryTypeRule = defineRule({
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow object-dictionary contracts whose direct value type is unknown, any, object, {}, or a union/alias containing one of those escape hatches.",
    },
    messages: {
      unsafeDictionary:
        "This dictionary's {{value}} value type gives callers no concrete value contract. Use an owner/schema-derived value type; parse external payloads before insertion.",
    },
  },
  create(context) {
    const environment = createTypeEnvironment(context.sourceCode.ast);
    const report = (node: ESTree.Node, value: string) => {
      context.report({ node, messageId: "unsafeDictionary", data: { value } });
    };
    const reportIfUnsafe = (node: ESTree.TSType) => {
      if (!shouldReportType(node, environment)) return;
      const unsafe = classifyUnsafeDictionary(node, environment);
      if (unsafe === null) return;
      report(node, unsafe.unsafeValue);
    };

    return {
      TSTypeReference: reportIfUnsafe,
      TSTypeLiteral: reportIfUnsafe,
      TSMappedType: reportIfUnsafe,
      TSIndexSignature(node) {
        if (node.typeAnnotation === null || node.parent.type === "TSTypeLiteral") return;
        const unsafe = classifyUnsafeDictionaryValue(
          node.typeAnnotation.typeAnnotation,
          environment,
        );
        if (unsafe !== null) report(node, unsafe.unsafeValue);
      },
    };
  },
});
