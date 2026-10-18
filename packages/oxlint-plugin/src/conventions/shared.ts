import { defineRule } from "@oxlint/plugins";
import type { Context, ESTree, Visitor } from "@oxlint/plugins";
import { Array, Option } from "effect";
import { childNodes, propertyName } from "../syntax.js";
import { referenceOf, valueOf } from "../native-reference.js";

export const rule = (message: string, create: (context: Context) => Visitor) =>
  defineRule({ meta: { type: "problem", schema: [], messages: { policy: message } }, create });

export const report = (context: Context, node: ESTree.Node) =>
  context.report({ node, messageId: "policy" });
export const testFile = (filename: string) =>
  /(?:\.(?:test|spec)\.[cm]?[jt]sx?$|\/(?:test|tests|testing)\/)/u.test(
    filename.replaceAll("\\", "/"),
  );
export const isFunction = (
  node: ESTree.Node,
): node is ESTree.ArrowFunctionExpression | ESTree.Function =>
  node.type === "ArrowFunctionExpression" ||
  node.type === "FunctionExpression" ||
  node.type === "FunctionDeclaration";

export const contains = (
  context: Context,
  node: ESTree.Node,
  accepts: (node: ESTree.Node) => boolean,
): boolean =>
  accepts(node) ||
  Array.some(childNodes(context, node), (child) => contains(context, child, accepts));

export const memberName = (
  context: Context,
  node: ESTree.Node,
  module: string,
): Option.Option<string> =>
  referenceOf(context, node).pipe(
    Option.filter((reference) => reference.module === module),
    Option.flatMap((reference) => reference.name),
  );

export const returns = (node: ESTree.Node): readonly ESTree.Node[] => {
  if (!isFunction(node) || node.body === null) return [];
  if (node.body.type !== "BlockStatement") return [node.body];
  return Array.flatMap(node.body.body, (statement) =>
    statement.type === "ReturnStatement"
      ? Option.toArray(Option.fromNullishOr(statement.argument))
      : [],
  );
};

export const effectCallback = (
  context: Context,
  node: ESTree.CallExpression,
): Option.Option<ESTree.ArrowFunctionExpression | ESTree.Function> => {
  const callee = node.callee.type === "CallExpression" ? node.callee.callee : node.callee;
  const method = memberName(context, callee, "effect/Effect");
  if (!Option.exists(method, (name) => name === "fn" || name === "fnUntraced"))
    return Option.none();
  return Array.head(node.arguments).pipe(Option.filter(isFunction));
};

// Brand discovery follows the Schema expression itself, never an unrelated
// callback's nested brand or a same-named, shadowed local object.
export const plainStringSchema = (
  context: Context,
  node: ESTree.Node,
  seen: readonly ESTree.Node[] = [],
): boolean => {
  if (Array.some(seen, (previous) => previous === node)) return false;
  const next = [...seen, node];
  const resolved = valueOf(context, node);
  if (Option.isSome(resolved) && resolved.value !== node)
    return plainStringSchema(context, resolved.value, next);
  if (
    Option.exists(
      memberName(context, node, "effect/Schema"),
      (name) => name === "String" || name === "Trimmed",
    )
  )
    return true;
  if (node.type !== "CallExpression") return false;
  const method = memberName(context, node.callee, "effect/Schema");
  if (
    Option.exists(
      method,
      (name) =>
        name === "Array" || name === "Option" || name === "optional" || name === "optionalKey",
    )
  ) {
    return Array.head(node.arguments).pipe(
      Option.exists((argument) => plainStringSchema(context, argument, next)),
    );
  }
  if (node.callee.type !== "MemberExpression") return false;
  if (
    !Option.exists(
      propertyName(node.callee.property),
      (name) => name === "pipe" || name === "check" || name === "make",
    )
  )
    return false;
  const branded = Array.some(
    node.arguments,
    (argument) =>
      argument.type === "CallExpression" &&
      Option.contains(memberName(context, argument.callee, "effect/Schema"), "brand"),
  );
  return !branded && plainStringSchema(context, node.callee.object, next);
};
