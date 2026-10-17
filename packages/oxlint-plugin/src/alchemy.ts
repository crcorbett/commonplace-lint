import { defineRule, eslintCompatPlugin } from "@oxlint/plugins";
import type { Context, ESTree } from "@oxlint/plugins";
import * as Array from "effect/Array";
import * as Option from "effect/Option";
import * as Predicate from "effect/Predicate";

import { operation, valueOf } from "./native-reference.js";
import { propertyName } from "./syntax.js";

type ObjectProperty = Extract<
  ESTree.ObjectExpression["properties"][number],
  { readonly type: "Property" }
>;

const providerCall = (context: Context, node: ESTree.Node, module: string, name: string) =>
  valueOf(context, node).pipe(
    Option.filter((value) => value.type === "CallExpression"),
    Option.filter((value) => operation(context, value.callee, module, name)),
  );

const field = (node: ESTree.Node, name: string): Option.Option<ObjectProperty> =>
  node.type === "ObjectExpression" &&
  Array.every<ESTree.ObjectExpression["properties"][number]>(
    (property) => property.type === "Property" && property.kind === "init" && !property.computed,
  )(node.properties)
    ? Array.findLast<ESTree.ObjectExpression["properties"][number]>(
        (property) =>
          property.type === "Property" && Option.contains(propertyName(property.key), name),
      )(node.properties).pipe(Option.filter((property) => property.type === "Property"))
    : Option.none();

const shellDisabled = (context: Context, node: ESTree.Node): boolean =>
  providerCall(context, node, "alchemy/Secrets", "ProcessEnv").pipe(
    Option.flatMap((call) => Array.head(call.arguments)),
    Option.flatMap((argument) => valueOf(context, argument)),
    Option.flatMap((options) => field(options, "disabled")),
    Option.flatMap((property) => valueOf(context, property.value)),
    Option.exists((disabled) => disabled.type === "Literal" && disabled.value === true),
  );

const nativeSources = defineRule({
  meta: {
    type: "problem",
    schema: [],
    messages: {
      sources:
        "Use [Doppler.Secrets(...), Alchemy.Secrets.DotEnv(), Alchemy.Secrets.ProcessEnv({ disabled: true })] in every stage; .env overrides Doppler.",
      shell:
        "Disable shell settings with Alchemy.Secrets.ProcessEnv({ disabled: true }); provider sign-in remains Alchemy's native responsibility.",
    },
  },
  create(context) {
    return {
      ArrayExpression(node) {
        const doppler = (element: ESTree.Node) =>
          Option.isSome(providerCall(context, element, "alchemy/Doppler", "Secrets"));
        if (!Array.some(node.elements, (element) => element !== null && doppler(element))) return;
        const valid =
          node.elements.length === 3 &&
          Array.get(node.elements, 0).pipe(
            Option.flatMap(Option.fromNullishOr),
            Option.exists(doppler),
          ) &&
          Array.get(node.elements, 1).pipe(
            Option.flatMap(Option.fromNullishOr),
            Option.exists((element) =>
              Option.isSome(providerCall(context, element, "alchemy/Secrets", "DotEnv")),
            ),
          ) &&
          Array.get(node.elements, 2).pipe(
            Option.flatMap(Option.fromNullishOr),
            Option.exists((element) => shellDisabled(context, element)),
          );
        if (!valid) context.report({ node, messageId: "sources" });
      },
      CallExpression(node) {
        if (
          operation(context, node.callee, "alchemy/Secrets", "ProcessEnv") &&
          !shellDisabled(context, node)
        ) {
          context.report({ node, messageId: "shell" });
        }
      },
    };
  },
});

const explicitStackSources = defineRule({
  meta: {
    type: "problem",
    schema: [],
    messages: {
      stack:
        "Declare secrets explicitly on the native Stack using the shared checked provider list; omitted settings keep Alchemy's legacy shell/dotenv behaviour.",
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        // Zero-argument and name-only calls declare a Stack class, not a configured stack.
        if (node.arguments.length < 2 || !operation(context, node.callee, "alchemy", "Stack"))
          return;
        const explicit = Array.get(node.arguments, 1).pipe(
          Option.flatMap((argument) => valueOf(context, argument)),
          Option.flatMap((options) => field(options, "secrets")),
          Option.exists(
            (property) =>
              property.value.type !== "Literal" &&
              !(property.value.type === "Identifier" && property.value.name === "undefined") &&
              valueOf(context, property.value).pipe(
                Option.match({
                  onNone: () => true,
                  onSome: (value) =>
                    value.type !== "Literal" &&
                    (value.type !== "ArrayExpression" || value.elements.length === 3),
                }),
              ),
          ),
        );
        if (!explicit) context.report({ node, messageId: "stack" });
      },
    };
  },
});

const commandText = (context: Context, node: ESTree.Node): Option.Option<string> =>
  valueOf(context, node).pipe(
    Option.flatMap((value) =>
      value.type === "Literal" && Predicate.isString(value.value)
        ? Option.some(value.value)
        : Option.none(),
    ),
  );

const noDopplerWrapper = defineRule({
  meta: {
    type: "problem",
    schema: [],
    messages: {
      wrapper:
        "Run the native Alchemy CLI with its declared secrets; remove Doppler CLI injection from this command.",
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        if (!operation(context, node.callee, "effect/process/ChildProcess", "make")) return;
        const command = Array.head(node.arguments).pipe(
          Option.flatMap((argument) => commandText(context, argument)),
        );
        const argumentsList = Array.get(node.arguments, 1).pipe(
          Option.flatMap((argument) => valueOf(context, argument)),
          Option.filter((argument) => argument.type === "ArrayExpression"),
        );
        const direct =
          Option.exists(command, (text) => /(?:^|\/)doppler$/u.test(text)) &&
          argumentsList.pipe(
            Option.flatMap((argumentsNode) => Array.head(argumentsNode.elements)),
            Option.flatMap(Option.fromNullishOr),
            Option.flatMap((argument) => commandText(context, argument)),
            Option.contains("run"),
          );
        const shell =
          Option.exists(command, (text) => /(?:^|\/)(?:sh|bash|zsh)$/u.test(text)) &&
          Option.exists(argumentsList, (argumentsNode) =>
            Array.some(
              argumentsNode.elements,
              (argument) =>
                argument !== null &&
                Option.exists(commandText(context, argument), (text) =>
                  /(?:^|[\s;|&])doppler\s+run(?:\s|$)/u.test(text),
                ),
            ),
          );
        if (direct || shell) context.report({ node, messageId: "wrapper" });
      },
    };
  },
});

export default eslintCompatPlugin({
  meta: { name: "alchemy-secrets" },
  rules: {
    "native-sources": nativeSources,
    "explicit-stack-sources": explicitStackSources,
    "no-doppler-wrapper": noDopplerWrapper,
  },
});
