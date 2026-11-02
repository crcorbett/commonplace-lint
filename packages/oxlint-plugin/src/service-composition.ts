import { defineRule } from "@oxlint/plugins";
import type { Context, ESTree } from "@oxlint/plugins";
import { Array, Option } from "effect";
import { operation, valueOf } from "./native-reference.js";
import {
  borrowedOperation,
  recordsOf,
  sameService,
  serviceOf,
  tracedOperation,
} from "./service-flow.js";
import { childNodes, propertyName, variableInScope } from "./syntax.js";

const sameParameter = (
  context: Context,
  parameter: ESTree.Node,
  argument: ESTree.Node,
): boolean => {
  if (parameter.type === "RestElement" && argument.type === "SpreadElement")
    return sameParameter(context, parameter.argument, argument.argument);
  return (
    parameter.type === "Identifier" &&
    argument.type === "Identifier" &&
    variableInScope(context.sourceCode.getScope(parameter), parameter.name).pipe(
      Option.exists((variable) =>
        Option.contains(
          variableInScope(context.sourceCode.getScope(argument), argument.name),
          variable,
        ),
      ),
    )
  );
};

const forwarding = (context: Context, node: ESTree.Node): boolean => {
  if (borrowedOperation(context, node) || tracedOperation(context, node)) return true;
  return valueOf(context, node).pipe(
    Option.exists((value) => {
      if (value.type !== "ArrowFunctionExpression" && value.type !== "FunctionExpression")
        return false;
      const result =
        value.body?.type === "BlockStatement"
          ? value.body.body.length === 1
            ? Array.head(value.body.body).pipe(
                Option.flatMap((statement) =>
                  statement.type === "ReturnStatement"
                    ? Option.fromNullishOr(statement.argument)
                    : Option.none(),
                ),
              )
            : Option.none<ESTree.Node>()
          : Option.fromNullishOr(value.body);
      return result.pipe(
        Option.exists((expression) => {
          const call = expression.type === "YieldExpression" ? expression.argument : expression;
          return (
            call?.type === "CallExpression" &&
            (borrowedOperation(context, call.callee) || tracedOperation(context, call.callee)) &&
            value.params.length === call.arguments.length &&
            Array.every(value.params, (parameter, index) =>
              Array.get(call.arguments, index).pipe(
                Option.exists((argument) => sameParameter(context, parameter, argument)),
              ),
            )
          );
        }),
      );
    }),
  );
};

export const noRedundantOperationWrappers = defineRule({
  meta: {
    type: "problem",
    docs: {
      description:
        "Reuse traced service operations instead of wrapping forwarding calls in another span.",
    },
    messages: {
      redundant:
        "Reuse the traced operation directly. A forwarding Effect.fn or span adds no implementation behaviour; provide dependencies through Layers.",
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        if (
          node.callee.type === "CallExpression" &&
          operation(context, node.callee.callee, "effect/Effect", "fn")
        ) {
          // Extra fn pipeline arguments can own real policy such as timeout/retry.
          if (node.arguments.length !== 1) return;
          if (Array.head(node.arguments).pipe(Option.exists((value) => forwarding(context, value))))
            context.report({ node, messageId: "redundant" });
          return;
        }
        const wrapped =
          node.callee.type === "MemberExpression" &&
          Option.contains(propertyName(node.callee.property), "pipe") &&
          node.arguments.length === 1 &&
          Array.head(node.arguments).pipe(
            Option.exists(
              (argument) =>
                argument.type === "CallExpression" &&
                operation(context, argument.callee, "effect/Effect", "withSpan"),
            ),
          )
            ? Option.some(node.callee.object)
            : operation(context, node.callee, "effect/Effect", "withSpan") &&
                node.arguments.length === 2
              ? Array.head(node.arguments)
              : Option.none<ESTree.Node>();
        if (
          Option.exists(
            wrapped,
            (value) =>
              borrowedOperation(context, value) ||
              tracedOperation(context, value) ||
              (value.type === "CallExpression" &&
                (borrowedOperation(context, value.callee) ||
                  tracedOperation(context, value.callee))),
          )
        )
          context.report({ node, messageId: "redundant" });
      },
    };
  },
});

const requires = (context: Context, node: ESTree.Node, target: ESTree.Node): boolean => {
  const owner = serviceOf(context, target);
  if (Option.isNone(owner)) return false;
  const matches = (candidate: ESTree.Node) =>
    serviceOf(context, candidate).pipe(
      Option.exists((service) => sameService(owner.value, service)),
    );
  const inspect = (value: ESTree.Node): boolean => {
    if (value.type === "YieldExpression" && value.argument && matches(value.argument)) return true;
    if (
      value.type === "ArrowFunctionExpression" ||
      value.type === "FunctionExpression" ||
      value.type === "FunctionDeclaration"
    )
      return false;
    return Array.some(childNodes(context, value), inspect);
  };
  return valueOf(context, node).pipe(
    Option.exists((value) => {
      if (value.type !== "CallExpression") return false;
      if (operation(context, value.callee, "effect/Effect", "gen")) {
        return Array.head(value.arguments).pipe(
          Option.flatMap((argument) => valueOf(context, argument)),
          Option.exists(
            (callback) =>
              (callback.type === "FunctionExpression" ||
                callback.type === "ArrowFunctionExpression") &&
              callback.body !== null &&
              inspect(callback.body),
          ),
        );
      }
      return (
        (operation(context, value.callee, "effect/Effect", "map") ||
          operation(context, value.callee, "effect/Effect", "flatMap")) &&
        Array.head(value.arguments).pipe(Option.exists(matches))
      );
    }),
  );
};

export const noServiceDecorators = defineRule({
  meta: {
    type: "problem",
    docs: {
      description:
        "Put owned service behaviour in its implementation, with dependencies supplied through Layers.",
    },
    messages: {
      decorator:
        "This Layer rebuilds the service it requires. Put analytics, metrics or other owned behaviour in the normal implementation and inject its dependencies through Layers.",
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        if (!operation(context, node.callee, "effect/Layer", "effect")) return;
        const target = Array.head(node.arguments);
        const construction = Array.get(node.arguments, 1);
        if (Option.isNone(target) || Option.isNone(construction)) return;
        // Native identity projections do not reconstruct or decorate operations.
        if (
          requires(context, construction.value, target.value) &&
          recordsOf(context, construction.value).length > 0
        )
          context.report({ node, messageId: "decorator" });
      },
    };
  },
});
