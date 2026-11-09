import { defineRule } from "@oxlint/plugins";
import type { Context, ESTree } from "@oxlint/plugins";
import { Array, Option } from "effect";
import { contains } from "../conventions/shared.js";
import { operation } from "../native-reference.js";
import { annotation, localType, nativeType, typeArguments } from "./syntax.js";

interface Signature {
  readonly node: ESTree.Node;
  readonly params: readonly ESTree.ParamPattern[];
  readonly typeParameters: readonly string[];
  readonly returnType: Option.Option<ESTree.TSType>;
}

const seen = (visited: readonly ESTree.Node[], node: ESTree.Node) =>
  Array.some(visited, (previous) => previous === node);

const fieldsOf = (
  context: Context,
  type: ESTree.TSType,
  visited: readonly ESTree.Node[],
): readonly ESTree.TSSignature[] => {
  if (type.type === "TSTypeLiteral") return type.members;
  if (type.type === "TSIntersectionType")
    return Array.flatMap(type.types, (entry) => fieldsOf(context, entry, visited));
  // Only named declarations can form cycles; guard those.
  return localType(context, type).pipe(
    Option.filter((declaration) => !seen(visited, declaration)),
    Option.map((declaration) =>
      declaration.type === "TSInterfaceDeclaration"
        ? declaration.body.body
        : fieldsOf(context, declaration.typeAnnotation, [...visited, declaration]),
    ),
    Option.getOrElse(() => []),
  );
};

const fieldType = (field: ESTree.TSSignature): Option.Option<ESTree.TSType> =>
  field.type === "TSPropertySignature"
    ? Option.fromNullishOr(field.typeAnnotation?.typeAnnotation)
    : Option.none();

const parameterNames = (declaration: ESTree.TSTypeParameterDeclaration | null) =>
  Array.map(declaration?.params ?? [], (parameter) => parameter.name.name);

// Operations are method signatures or function-typed properties. Readonly
// resource groups are traversed so `orders.session.run` is still a contract.
const signatures = (
  context: Context,
  fields: readonly ESTree.TSSignature[],
  visited: readonly ESTree.Node[],
): readonly Signature[] =>
  Array.flatMap(fields, (field): readonly Signature[] => {
    if (field.type === "TSMethodSignature")
      return [
        {
          node: field,
          params: field.params,
          typeParameters: parameterNames(field.typeParameters),
          returnType: Option.fromNullishOr(field.returnType?.typeAnnotation),
        },
      ];
    return fieldType(field).pipe(
      Option.map((type): readonly Signature[] =>
        type.type === "TSFunctionType"
          ? [
              {
                node: field,
                params: type.params,
                typeParameters: parameterNames(type.typeParameters),
                returnType: Option.some(type.returnType.typeAnnotation),
              },
            ]
          : type.type === "TSTypeLiteral"
            ? signatures(context, fieldsOf(context, type, visited), visited)
            : [],
      ),
      Option.getOrElse(() => []),
    );
  });

const containsLayer = (
  context: Context,
  type: ESTree.TSType,
  visited: readonly ESTree.Node[],
): boolean => {
  if (seen(visited, type)) return false;
  const next = [...visited, type];
  if (nativeType(context, type, "Layer")) return true;
  if (type.type === "TSUnionType" || type.type === "TSIntersectionType")
    return Array.some(type.types, (entry) => containsLayer(context, entry, next));
  if (type.type === "TSTypeOperator") return containsLayer(context, type.typeAnnotation, next);
  if (type.type === "TSArrayType") return containsLayer(context, type.elementType, next);
  if (type.type === "TSTypeLiteral" || type.type === "TSTypeReference")
    return (
      Array.some(typeArguments(type), (entry) => containsLayer(context, entry, next)) ||
      Array.some(fieldsOf(context, type, next), (field) =>
        fieldType(field).pipe(Option.exists((entry) => containsLayer(context, entry, next))),
      )
    );
  return false;
};

const namedType = (type: ESTree.TSType, name: string) =>
  type.type === "TSTypeReference" &&
  type.typeName.type === "Identifier" &&
  type.typeName.name === name;

// A type parameter is a supplied requirement when it fills the third slot of an
// Effect parameter, directly or through a local generic request type.
const requirement = (
  context: Context,
  type: ESTree.TSType,
  name: string,
  visited: readonly ESTree.Node[],
): boolean => {
  if (seen(visited, type)) return false;
  const next = [...visited, type];
  if (nativeType(context, type, "Effect"))
    return Array.get(typeArguments(type), 2).pipe(Option.exists((entry) => namedType(entry, name)));
  if (type.type === "TSUnionType" || type.type === "TSIntersectionType")
    return Array.some(type.types, (entry) => requirement(context, entry, name, next));
  if (type.type === "TSTypeOperator") return requirement(context, type.typeAnnotation, name, next);
  if (type.type === "TSTypeLiteral")
    return Array.some(type.members, (field) =>
      fieldType(field).pipe(Option.exists((entry) => requirement(context, entry, name, next))),
    );
  return localType(context, type).pipe(
    Option.exists((declaration) => {
      const inner = Array.flatMap(typeArguments(type), (entry, index) =>
        namedType(entry, name)
          ? Option.toArray(Array.get(parameterNames(declaration.typeParameters), index))
          : [],
      );
      return Array.some(inner, (innerName) =>
        Array.some(fieldsOf(context, type, next), (field) =>
          fieldType(field).pipe(
            Option.exists((entry) => requirement(context, entry, innerName, next)),
          ),
        ),
      );
    }),
  );
};

const mentions = (context: Context, type: ESTree.Node, name: string) =>
  contains(context, type, (node) => node.type === "TSTypeReference" && namedType(node, name));

export const noLayerParametersInServiceContracts = defineRule({
  meta: {
    type: "problem",
    docs: {
      description: "Keep Layers and open requirements out of Context.Service operation signatures.",
    },
    messages: {
      layer:
        "A service operation must not accept a Layer. Build dependencies into the live Layer and expose named operations with closed requirements.",
      requirements:
        "This service operation is generic over the requirements of an Effect it receives, so callers can discharge arbitrary services through it. Expose named domain operations with closed requirements and compose Layers at the application root.",
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        if (!operation(context, node.callee, "effect/Context", "Service")) return;
        Array.get(node.typeArguments?.params ?? [], 1).pipe(
          Option.map((contract) => signatures(context, fieldsOf(context, contract, []), [])),
          Option.map((operations) =>
            Array.forEach(operations, (signature) => {
              Array.forEach(signature.params, (parameter) => {
                if (
                  annotation(parameter).pipe(
                    Option.exists((type) => containsLayer(context, type, [])),
                  )
                )
                  context.report({ node: parameter, messageId: "layer" });
              });
              const open = Array.some(
                signature.typeParameters,
                (name) =>
                  Array.some(signature.params, (parameter) =>
                    annotation(parameter).pipe(
                      Option.exists((type) => requirement(context, type, name, [])),
                    ),
                  ) &&
                  !signature.returnType.pipe(
                    Option.exists((type) => mentions(context, type, name)),
                  ),
              );
              if (open) context.report({ node: signature.node, messageId: "requirements" });
            }),
          ),
        );
      },
    };
  },
});
