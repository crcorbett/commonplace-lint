import { defineRule } from "@oxlint/plugins";
import type { Context, ESTree } from "@oxlint/plugins";
import { Array, Option, Predicate, Schema } from "effect";
import { operation, valueOf } from "../native-reference.js";
import { propertyName } from "../syntax.js";
import { contains, report, returns, rule, testFile } from "./shared.js";

const releaseMatches = (context: Context, release: ESTree.Node, handler: boolean): boolean => {
  if (release.type !== "ArrowFunctionExpression" && release.type !== "FunctionExpression")
    return false;
  const parameter = Array.head(release.params);
  const body = Array.head(returns(release));
  if (Option.isNone(parameter) || Option.isNone(body)) return false;
  if (!handler)
    return (
      parameter.value.type === "Identifier" &&
      body.value.type === "MemberExpression" &&
      body.value.object.type === "Identifier" &&
      body.value.object.name === parameter.value.name &&
      Option.contains(propertyName(body.value.property), "disposeEffect")
    );
  if (
    parameter.value.type !== "ObjectPattern" ||
    body.value.type !== "CallExpression" ||
    !operation(context, body.value.callee, "effect/Effect", "promise")
  )
    return false;
  const callback = Array.head(body.value.arguments);
  return callback.pipe(
    Option.exists(
      (argument) =>
        argument.type === "Identifier" &&
        parameter.value.type === "ObjectPattern" &&
        Array.some(
          parameter.value.properties,
          (property) =>
            property.type === "Property" &&
            Option.contains(propertyName(property.key), "dispose") &&
            property.value.type === "Identifier" &&
            property.value.name === argument.name,
        ),
    ),
  );
};

const acquired = (context: Context, node: ESTree.CallExpression, handler: boolean): boolean => {
  const search = (parent: ESTree.Node | null): boolean => {
    if (parent === null) return false;
    if (
      parent.type === "CallExpression" &&
      operation(context, parent.callee, "effect/Effect", "acquireRelease")
    ) {
      const acquire = Array.get(parent.arguments, 0).pipe(
        Option.flatMap((value) => valueOf(context, value)),
      );
      const release = Array.get(parent.arguments, 1).pipe(
        Option.flatMap((value) => valueOf(context, value)),
      );
      return (
        acquire.pipe(
          Option.exists(
            (value) =>
              value.type === "CallExpression" &&
              operation(context, value.callee, "effect/Effect", "sync") &&
              Array.head(value.arguments).pipe(
                Option.exists((callback) => Array.contains(returns(callback), node)),
              ),
          ),
        ) && release.pipe(Option.exists((value) => releaseMatches(context, value, handler)))
      );
    }
    return search(parent.parent);
  };
  return search(node.parent);
};

const HostLifetimes = Schema.Struct({
  hostLifetimes: Schema.optionalKey(
    Schema.Array(
      Schema.Struct({ file: Schema.NonEmptyString, declaration: Schema.NonEmptyString }),
    ),
  ),
});

const scopedManagedRuntime = defineRule({
  meta: {
    type: "problem",
    schema: [
      {
        type: "object",
        properties: {
          hostLifetimes: {
            type: "array",
            items: {
              type: "object",
              properties: {
                file: { type: "string", minLength: 1 },
                declaration: { type: "string", minLength: 1 },
              },
              required: ["file", "declaration"],
              additionalProperties: false,
            },
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      policy:
        "Acquire ManagedRuntime with its own disposer, or declare the exact top-level runtime whose lifetime the host owns.",
    },
  },
  create(context) {
    const options = Array.head(context.options).pipe(
      Option.flatMap(Schema.decodeUnknownOption(HostLifetimes)),
      Option.getOrElse(() => ({ hostLifetimes: [] })),
    );
    return {
      CallExpression(node) {
        if (!operation(context, node.callee, "effect/ManagedRuntime", "make")) return;
        const declaration = node.parent;
        const hosted =
          declaration.type === "VariableDeclarator" &&
          declaration.init === node &&
          declaration.id.type === "Identifier" &&
          declaration.parent.type === "VariableDeclaration" &&
          declaration.parent.kind === "const" &&
          (declaration.parent.parent.type === "Program" ||
            (declaration.parent.parent.type === "ExportNamedDeclaration" &&
              declaration.parent.parent.parent.type === "Program")) &&
          Array.some(
            options.hostLifetimes ?? [],
            (owner) =>
              declaration.id.type === "Identifier" &&
              owner.declaration === declaration.id.name &&
              context.filename.replaceAll("\\", "/") ===
                `${context.cwd.replaceAll("\\", "/")}/${owner.file}`,
          );
        if (!hosted && !acquired(context, node, false)) report(context, node);
      },
    };
  },
});

export const lifetimeRules = {
  "scoped-managed-runtime": scopedManagedRuntime,
  "scoped-web-handler": rule(
    "Acquire the web handler with Effect.acquireRelease and register its own dispose callback through Effect.promise.",
    (context) => ({
      CallExpression(node) {
        if (
          (operation(context, node.callee, "effect/http/HttpRouter", "toWebHandler") ||
            operation(context, node.callee, "effect/unstable/http/HttpRouter", "toWebHandler")) &&
          !acquired(context, node, true)
        )
          report(context, node);
      },
    }),
  ),
  "no-live-alchemy-lifecycle": rule(
    "Use the native Alchemy CLI for live lifecycle operations; Plan.make/apply and Test/Core are test-only.",
    (context) =>
      testFile(context.filename)
        ? {}
        : {
            ImportDeclaration(node) {
              if (node.source.value === "alchemy/Test/Core") report(context, node);
            },
            CallExpression(node) {
              if (
                operation(context, node.callee, "alchemy", "apply") ||
                operation(context, node.callee, "alchemy/Plan", "make")
              )
                report(context, node);
            },
          },
  ),
  "no-node-runtime": rule(
    "Use the application's configured Bun runtime owner rather than NodeRuntime.",
    (context) => ({
      ImportDeclaration(node) {
        if (
          /^(?:@effect|effect)\/platform-node(?:\/NodeRuntime)?$/u.test(node.source.value) &&
          (node.source.value.endsWith("/NodeRuntime") ||
            Array.some(
              node.specifiers,
              (specifier) =>
                specifier.type === "ImportSpecifier" &&
                Option.contains(propertyName(specifier.imported), "NodeRuntime"),
            ))
        )
          report(context, node);
      },
      CallExpression(node) {
        if (operation(context, node.callee, "effect/platform-node/NodeRuntime", "runMain"))
          report(context, node);
      },
    }),
  ),
  "effect-script-entry": rule(
    "Repository scripts use TypeScript and the native Bun Effect runtime; Effect tests own test execution.",
    (context) => ({
      Literal(node) {
        if (
          /(?:^|\/)scripts\//u.test(context.filename) &&
          Predicate.isString(node.value) &&
          /(?:^|\s)node\s+(?:--test\b|scripts\/)/u.test(node.value)
        )
          report(context, node);
      },
      Program(node) {
        if (!/(?:^|\/)scripts\//u.test(context.filename)) return;
        if (context.filename.endsWith(".mjs")) {
          report(context, node);
          return;
        }
        if (!context.filename.endsWith(".ts")) return;
        const imports = Array.filter(
          node.body,
          (statement) => statement.type === "ImportDeclaration",
        );
        const effect = Array.some(
          imports,
          (statement) =>
            statement.type === "ImportDeclaration" &&
            /^effect(?:\/|$)/u.test(statement.source.value),
        );
        const test = Array.some(
          imports,
          (statement) =>
            statement.type === "ImportDeclaration" &&
            (statement.source.value === "@effect/vitest" || statement.source.value === "bun:test"),
        );
        const runtime = Array.some(
          imports,
          (statement) =>
            statement.type === "ImportDeclaration" &&
            statement.source.value === "@effect/platform-bun/BunRuntime",
        );
        const launches = contains(
          context,
          node,
          (value) =>
            value.type === "CallExpression" &&
            operation(context, value.callee, "@effect/platform-bun/BunRuntime", "runMain"),
        );
        if (!effect || (testFile(context.filename) ? !test : !runtime || !launches))
          report(context, node);
      },
      ImportDeclaration(node) {
        if (
          /(?:^|\/)scripts\//u.test(context.filename) &&
          node.source.value === "node:child_process"
        )
          report(context, node);
      },
      MemberExpression(node) {
        if (
          /(?:^|\/)scripts\//u.test(context.filename) &&
          node.object.type === "Identifier" &&
          node.object.name === "process" &&
          Option.contains(propertyName(node.property), "execPath")
        )
          report(context, node);
      },
    }),
  ),
};
