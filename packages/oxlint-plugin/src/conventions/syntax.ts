import type { ESTree } from "@oxlint/plugins";
import { Array, Option } from "effect";
import { propertyName } from "../syntax.js";
import { operation } from "../native-reference.js";
import {
  effectCallback,
  isFunction,
  memberName,
  report,
  returns,
  rule,
  testFile,
} from "./shared.js";

const primitive = (node: ESTree.Node): boolean =>
  node.type === "Literal" ||
  (node.type === "Identifier" && node.name === "undefined") ||
  (node.type === "TemplateLiteral" && node.expressions.length === 0) ||
  (node.type === "UnaryExpression" && Array.contains(["void", "-", "+", "!"], node.operator));

export const syntaxRules = {
  "no-conditional-object-spread": rule(
    "Use Schema-owned optional fields instead of conditional object spreads.",
    (context) => ({
      SpreadElement(node) {
        if (
          node.parent.type === "ObjectExpression" &&
          (node.argument.type === "ConditionalExpression" ||
            node.argument.type === "LogicalExpression")
        )
          report(context, node);
      },
    }),
  ),
  "no-in-operator": rule(
    "Use Schema or Effect Record/HashMap operations instead of probing keys with in.",
    (context) => ({
      BinaryExpression(node) {
        if (node.operator === "in") report(context, node);
      },
    }),
  ),
  "no-nullish-comparison": rule(
    "Keep absence as Option and use its matching operations.",
    (context) => ({
      BinaryExpression(node) {
        if (
          Array.contains(["===", "!==", "==", "!="], node.operator) &&
          Array.some(
            [node.left, node.right],
            (side) =>
              (side.type === "Literal" && side.value === null) ||
              (side.type === "Identifier" && side.name === "undefined"),
          )
        )
          report(context, node);
      },
    }),
  ),
  "no-native-collections": rule(
    "Use immutable Effect HashMap and HashSet instead of native mutable collections.",
    (context) => ({
      NewExpression(node) {
        if (
          node.callee.type === "Identifier" &&
          Array.contains(["Map", "Set", "WeakMap", "WeakSet"], node.callee.name)
        )
          report(context, node);
      },
    }),
  ),
  "curried-collections": rule(
    "Use curried Effect collection operations so transformations remain pipeable.",
    (context) => ({
      CallExpression(node) {
        if (node.arguments.length < 2) return;
        if (
          Array.some(["Array", "Chunk", "HashMap", "HashSet", "Option", "Record"], (module) =>
            memberName(context, node.callee, `effect/${module}`).pipe(
              Option.exists(
                (name) =>
                  Array.contains(
                    [
                      "every",
                      "filter",
                      "findFirst",
                      "flatMap",
                      "forEach",
                      "map",
                      "partition",
                      "reduce",
                      "some",
                      "sort",
                    ],
                    name,
                  ) &&
                  (name !== "reduce" || node.arguments.length >= 3),
              ),
            ),
          )
        )
          report(context, node);
      },
    }),
  ),
  "no-wrapper-composition": rule(
    "Use a pipe for sequential transformations and keep one-use mapper callbacks inline.",
    (context) => ({
      CallExpression(node) {
        if (
          node.callee.type === "Identifier" &&
          Array.some(node.arguments, (argument) => argument.type === "CallExpression")
        )
          report(context, node);
        const mapper =
          Option.exists(
            memberName(context, node.callee, "effect/Effect"),
            (name) => name === "map" || name === "mapError",
          ) ||
          Option.exists(
            memberName(context, node.callee, "effect/rpc/Rpc"),
            (name) => name === "map" || name === "mapError",
          ) ||
          Option.exists(memberName(context, node.callee, "effect/Schema"), (name) =>
            /^(?:decode|encode)/u.test(name),
          );
        if (mapper)
          Array.forEach(node.arguments, (argument) => {
            if (
              argument.type === "Identifier" &&
              /^(?:map|to|decode|encode|normalize)[A-Z]\w*$/u.test(argument.name)
            )
              report(context, argument);
          });
      },
    }),
  ),
  "no-nullable-boundary-leak": rule(
    "Keep internal absence as Option; confine null to an owning external codec.",
    (context) =>
      testFile(context.filename)
        ? {}
        : {
            CallExpression(node) {
              if (
                operation(context, node.callee, "effect/Option", "getOrNull") ||
                operation(context, node.callee, "effect/Schema", "NullOr")
              )
                report(context, node);
            },
            Property(node) {
              if (node.value.type === "Literal" && node.value.value === null)
                report(context, node.value);
            },
          },
  ),
  "no-primitive-failure": rule(
    "Use an owner-named tagged error instead of a primitive Effect failure.",
    (context) => ({
      CallExpression(node) {
        const method = memberName(context, node.callee, "effect/Effect");
        const argument = Array.head(node.arguments);
        if (Option.isNone(argument)) return;
        if (
          (Option.contains(method, "fail") && primitive(argument.value)) ||
          (Option.exists(method, (name) => name === "failSync" || name === "mapError") &&
            Array.some(returns(argument.value), primitive))
        )
          report(context, node);
      },
    }),
  ),
  "require-try-promise-catch": rule(
    "Map Promise rejection explicitly with Effect.tryPromise({ try, catch }).",
    (context) => ({
      CallExpression(node) {
        if (!operation(context, node.callee, "effect/Effect", "tryPromise")) return;
        const argument = Array.head(node.arguments);
        if (
          Option.isNone(argument) ||
          argument.value.type !== "ObjectExpression" ||
          !Array.every(
            ["try", "catch"],
            (name) =>
              argument.value.type === "ObjectExpression" &&
              Array.some(
                argument.value.properties,
                (property) =>
                  property.type === "Property" && Option.contains(propertyName(property.key), name),
              ),
          )
        )
          report(context, node);
      },
    }),
  ),
  "no-defecting-layer": rule(
    "Preserve typed Layer construction failures instead of Layer.orDie.",
    (context) => ({
      CallExpression(node) {
        if (operation(context, node.callee, "effect/Layer", "orDie")) report(context, node);
      },
    }),
  ),
  "named-effect-operations": rule(
    "Name reusable operations with Effect.fn or Effect.fnUntraced rather than returning Effect.gen from a plain function.",
    (context) => ({
      VariableDeclarator(node) {
        if (
          node.init &&
          isFunction(node.init) &&
          Array.some(
            returns(node.init),
            (value) =>
              value.type === "CallExpression" &&
              operation(context, value.callee, "effect/Effect", "gen"),
          )
        )
          report(context, node.id);
      },
      ExportNamedDeclaration(node) {
        if (
          node.declaration?.type === "FunctionDeclaration" &&
          Array.some(
            returns(node.declaration),
            (value) =>
              value.type === "CallExpression" &&
              operation(context, value.callee, "effect/Effect", "gen"),
          )
        )
          report(context, node.declaration);
      },
    }),
  ),
  "object-operation-input": rule(
    "Reusable Effect operations accept no arguments or one Schema-owned object input.",
    (context) => ({
      ExportNamedDeclaration(node) {
        if (!/(?:^|\/)actors\/[^/]+-(?:state|recovery)\.ts$/u.test(context.filename)) return;
        const declaration = node.declaration;
        if (declaration?.type === "FunctionDeclaration" && declaration.params.length > 1)
          report(context, declaration);
        if (declaration?.type === "VariableDeclaration")
          Array.forEach(declaration.declarations, (value) => {
            if (value.init && isFunction(value.init) && value.init.params.length > 1)
              report(context, value.id);
          });
      },
      CallExpression(node) {
        effectCallback(context, node).pipe(
          Option.map((callback) => {
            const parameter = Array.head(callback.params);
            const type = parameter.pipe(
              Option.flatMap((value) =>
                value.type === "TSParameterProperty"
                  ? Option.none<ESTree.TSType>()
                  : Option.fromNullishOr(value.typeAnnotation?.typeAnnotation),
              ),
            );
            if (
              callback.params.length > 1 ||
              parameter.pipe(Option.exists((value) => value.type === "RestElement")) ||
              type.pipe(
                Option.exists((value) =>
                  Array.contains(
                    [
                      "TSArrayType",
                      "TSBigIntKeyword",
                      "TSBooleanKeyword",
                      "TSFunctionType",
                      "TSLiteralType",
                      "TSNeverKeyword",
                      "TSNullKeyword",
                      "TSNumberKeyword",
                      "TSStringKeyword",
                      "TSSymbolKeyword",
                      "TSTupleType",
                      "TSUndefinedKeyword",
                      "TSVoidKeyword",
                    ],
                    value.type,
                  ),
                ),
              )
            )
              report(context, node);
          }),
        );
      },
    }),
  ),
};
