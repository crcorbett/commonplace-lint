import type { Context, ESTree } from "@oxlint/plugins";
import { Array, Option, Predicate } from "effect";
import { memberName } from "../conventions/shared.js";
import { propertyName, variableInScope } from "../syntax.js";

interface TypeReference {
  readonly module: string;
  readonly name: Option.Option<string>;
}

// Type positions may use `import type`; runtime references deliberately ignore
// those bindings, so type names resolve through their own import lookup.
const importedType = (context: Context, node: ESTree.Node): Option.Option<TypeReference> => {
  if (node.type === "TSQualifiedName") {
    const right = node.right.name;
    return importedType(context, node.left).pipe(
      Option.filter((reference) => Option.isNone(reference.name)),
      Option.map((reference) =>
        reference.module === "effect"
          ? { module: `effect/${right}`, name: Option.none<string>() }
          : { module: reference.module, name: Option.some(right) },
      ),
    );
  }
  if (node.type !== "Identifier") return Option.none();
  return variableInScope(context.sourceCode.getScope(node), node.name).pipe(
    Option.flatMap((variable) => Array.head(variable.defs)),
    Option.flatMap((definition) => {
      if (definition.type !== "ImportBinding" || definition.parent?.type !== "ImportDeclaration")
        return Option.none();
      const module = definition.parent.source.value;
      if (definition.node.type === "ImportNamespaceSpecifier")
        return Option.some({ module, name: Option.none<string>() });
      if (definition.node.type !== "ImportSpecifier") return Option.none();
      return propertyName(definition.node.imported).pipe(
        Option.map((name) =>
          module === "effect"
            ? { module: `effect/${name}`, name: Option.none<string>() }
            : { module, name: Option.some(name) },
        ),
      );
    }),
  );
};

/** A written `Layer.Layer` or `Effect.Effect` type imported from Effect. */
export const nativeType = (context: Context, type: ESTree.Node, name: "Effect" | "Layer") =>
  type.type === "TSTypeReference" &&
  importedType(context, type.typeName).pipe(
    Option.exists(
      (reference) => reference.module === `effect/${name}` && Option.contains(reference.name, name),
    ),
  );

export type LocalType = ESTree.TSInterfaceDeclaration | ESTree.TSTypeAliasDeclaration;

/** A same-file interface or type alias named by a type reference. */
export const localType = (context: Context, type: ESTree.Node): Option.Option<LocalType> => {
  if (type.type !== "TSTypeReference" || type.typeName.type !== "Identifier") return Option.none();
  return variableInScope(context.sourceCode.getScope(type.typeName), type.typeName.name).pipe(
    Option.flatMap((variable) => Array.head(variable.defs)),
    Option.flatMap((definition) =>
      definition.node.type === "TSInterfaceDeclaration" ||
      definition.node.type === "TSTypeAliasDeclaration"
        ? Option.some(definition.node)
        : Option.none(),
    ),
  );
};

export const typeArguments = (type: ESTree.Node): readonly ESTree.TSType[] =>
  type.type === "TSTypeReference" ? (type.typeArguments?.params ?? []) : [];

export const annotation = (parameter: ESTree.Node): Option.Option<ESTree.TSType> => {
  if (parameter.type === "TSParameterProperty") return annotation(parameter.parameter);
  if (
    parameter.type === "Identifier" ||
    parameter.type === "ObjectPattern" ||
    parameter.type === "ArrayPattern" ||
    parameter.type === "RestElement"
  )
    return Option.fromNullishOr(parameter.typeAnnotation?.typeAnnotation);
  return Option.none();
};

/** The native Effect module member called by a call expression. */
export const called = (context: Context, node: ESTree.Node, module: string) =>
  node.type === "CallExpression" ? memberName(context, node.callee, module) : Option.none<string>();

/** A curried native call such as `Effect.fn("name")(body)` or `Layer.succeed(Tag)(value)`. */
export const curried = (context: Context, node: ESTree.CallExpression, module: string) =>
  node.callee.type === "CallExpression"
    ? memberName(context, node.callee.callee, module)
    : Option.none<string>();

export const isArgument = (call: ESTree.CallExpression, node: ESTree.Node) =>
  Array.some(call.arguments, (argument) => argument === node);

export const stringLiteral = (node: ESTree.Node): Option.Option<string> =>
  node.type === "Literal" && Predicate.isString(node.value)
    ? Option.some(node.value)
    : Option.none();

/** A literal value or an object pattern made only of literal values. */
const literalPattern = (node: ESTree.Node): boolean => {
  if (node.type === "Literal")
    return (
      node.value === null ||
      Predicate.isString(node.value) ||
      Predicate.isNumber(node.value) ||
      Predicate.isBoolean(node.value)
    );
  if (node.type === "TemplateLiteral") return node.expressions.length === 0;
  if (node.type === "UnaryExpression")
    return (
      node.operator === "-" &&
      node.argument.type === "Literal" &&
      Predicate.isNumber(node.argument.value)
    );
  if (node.type === "ObjectExpression")
    return (
      node.properties.length > 0 &&
      Array.every(
        node.properties,
        (property) =>
          property.type === "Property" && !property.computed && literalPattern(property.value),
      )
    );
  return false;
};

/** The identifier at the root of `value`, `value.field` or `value?.field`. */
type IdentifierNode = Extract<ESTree.Node, { readonly type: "Identifier" }>;
export const rootIdentifier = (node: ESTree.Node): Option.Option<IdentifierNode> => {
  if (node.type === "Identifier") return Option.some(node);
  if (node.type === "ChainExpression") return rootIdentifier(node.expression);
  if (node.type === "MemberExpression") return rootIdentifier(node.object);
  if (node.type === "TSNonNullExpression") return rootIdentifier(node.expression);
  return Option.none();
};

export const matchModule = "effect/Match";
export const effectModule = "effect/Effect";

/** Arguments that discriminate a `Match` case by literal values or tags. */
export const discriminants = (context: Context, node: ESTree.Node): Option.Option<number> => {
  if (node.type !== "CallExpression") return Option.none();
  const prefix = Array.dropRight(node.arguments, 1);
  const name = memberName(context, node.callee, matchModule);
  if (Option.contains(name, "when") || Option.contains(name, "whenOr"))
    return prefix.length > 0 && Array.every(prefix, literalPattern)
      ? Option.some(prefix.length)
      : Option.none();
  if (
    Option.contains(name, "tag") ||
    Option.contains(curried(context, node, matchModule), "discriminator")
  )
    return prefix.length > 0 && Array.every(prefix, (entry) => Option.isSome(stringLiteral(entry)))
      ? Option.some(prefix.length)
      : Option.none();
  const table =
    Option.contains(name, "tags") ||
    Option.contains(name, "tagsExhaustive") ||
    Option.contains(curried(context, node, matchModule), "discriminators") ||
    Option.contains(curried(context, node, matchModule), "discriminatorsExhaustive");
  return table
    ? Array.head(node.arguments).pipe(
        Option.filter((entry) => entry.type === "ObjectExpression"),
        Option.map((entry) => (entry.type === "ObjectExpression" ? entry.properties.length : 0)),
        Option.filter((count) => count > 0),
      )
    : Option.none();
};
