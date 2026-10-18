import { requireServiceOperationInstrumentation } from "./service-instrumentation.js";
import { defineRule } from "@oxlint/plugins";
import type { ESTree } from "@oxlint/plugins";
import { Array, Option, Schema } from "effect";
import { propertyName } from "./syntax.js";

const memberExpressionName = (node: ESTree.Node): Option.Option<string> => {
  if (node?.type !== "MemberExpression" || node.object?.type !== "Identifier") {
    return Option.none();
  }
  const property = propertyName(node.property);
  const objectName = node.object.name;
  return Option.map(property, (name) => `${objectName}.${name}`);
};

const isMemberCall = (node: ESTree.Node, objectName: string, methodName: string) =>
  node?.type === "CallExpression" &&
  node.callee?.type === "MemberExpression" &&
  node.callee.object?.type === "Identifier" &&
  node.callee.object.name === objectName &&
  Option.contains(propertyName(node.callee.property), methodName);

const noAmbientProcess = defineRule({
  create(context) {
    return {
      MemberExpression(node) {
        if (
          Option.exists(memberExpressionName(node), (name) =>
            Array.contains(["process.argv", "process.env", "process.exit"], name),
          )
        ) {
          context.report({ messageId: "noAmbientProcess", node });
        }
      },
    };
  },
  meta: {
    docs: { description: "Disallow ambient process input and exit control." },
    messages: {
      noAmbientProcess:
        "Use decoded command input, Effect Config and typed command results instead of ambient process state.",
    },
    type: "problem",
  },
});

const noRawFetch = defineRule({
  create(context) {
    return {
      CallExpression(node) {
        const isBareFetch = node.callee?.type === "Identifier" && node.callee.name === "fetch";
        const isGlobalFetch =
          node.callee?.type === "MemberExpression" &&
          node.callee.object?.type === "Identifier" &&
          ["globalThis", "window"].includes(node.callee.object.name) &&
          Option.contains(propertyName(node.callee.property), "fetch");
        if (isBareFetch || isGlobalFetch) {
          context.report({ messageId: "noRawFetch", node: node.callee });
        }
      },
    };
  },
  meta: {
    docs: { description: "Disallow raw fetch in Effect-owned TypeScript." },
    messages: {
      noRawFetch: "Use Effect HttpClient and decode the response with its owning Schema.",
    },
    type: "problem",
  },
});

const noUncheckedJson = defineRule({
  create(context) {
    return {
      CallExpression(node) {
        if (isMemberCall(node, "JSON", "parse")) {
          context.report({ messageId: "noUncheckedJson", node: node.callee });
        }
      },
    };
  },
  meta: {
    docs: { description: "Disallow JSON.parse without an owning Schema." },
    messages: {
      noUncheckedJson: "Decode JSON text with the owning Effect Schema.",
    },
    type: "problem",
  },
});

const noConsole = defineRule({
  create(context) {
    return {
      MemberExpression(node) {
        if (node.object?.type === "Identifier" && node.object.name === "console") {
          context.report({ messageId: "noConsole", node });
        }
      },
    };
  },
  meta: {
    docs: { description: "Disallow raw console calls in Effect-owned TypeScript." },
    messages: {
      noConsole: "Use Effect Console or structured Effect logging.",
    },
    type: "problem",
  },
});

type FunctionNode = ESTree.ArrowFunctionExpression | ESTree.Function;
const isFunctionNode = (node: ESTree.Node): node is FunctionNode =>
  node.type === "ArrowFunctionExpression" ||
  node.type === "FunctionDeclaration" ||
  node.type === "FunctionExpression";

const nearestFunction = (node: ESTree.Node | null): Option.Option<FunctionNode> =>
  node === null
    ? Option.none()
    : isFunctionNode(node)
      ? Option.some(node)
      : nearestFunction(node.parent);

const isAllowedPromiseBoundary = (node: FunctionNode) => {
  const parent = node?.parent;
  if (parent?.type === "CallExpression" && parent.arguments?.includes(node)) {
    return (
      parent.callee?.type === "MemberExpression" &&
      parent.callee.object?.type === "Identifier" &&
      parent.callee.object.name === "Effect" &&
      Option.exists(propertyName(parent.callee.property), (name) =>
        Array.contains(["promise", "tryPromise"], name),
      )
    );
  }
  if (parent?.type !== "Property" || !Option.contains(propertyName(parent.key), "try")) {
    return false;
  }
  const options = parent.parent;
  const call = options?.parent;
  return (
    options?.type === "ObjectExpression" &&
    call?.type === "CallExpression" &&
    call.arguments?.includes(options) &&
    call.callee?.type === "MemberExpression" &&
    call.callee.object?.type === "Identifier" &&
    call.callee.object.name === "Effect" &&
    Option.contains(propertyName(call.callee.property), "tryPromise")
  );
};

const noAsyncAwaitPromise = defineRule({
  create(context) {
    const reportAsync = (node: FunctionNode) => {
      if (node.async && !isAllowedPromiseBoundary(node)) {
        context.report({ messageId: "noAsync", node });
      }
    };
    return {
      ArrowFunctionExpression: reportAsync,
      AwaitExpression(node) {
        if (!Option.exists(nearestFunction(node.parent), isAllowedPromiseBoundary)) {
          context.report({ messageId: "noAwait", node });
        }
      },
      FunctionDeclaration: reportAsync,
      FunctionExpression: reportAsync,
      Identifier(node) {
        if (
          node.name === "Promise" &&
          node.parent?.type === "TSTypeReference" &&
          node.parent.typeName === node
        ) {
          context.report({ messageId: "noPromiseType", node });
        }
      },
      NewExpression(node) {
        if (node.callee?.type === "Identifier" && node.callee.name === "Promise") {
          context.report({ messageId: "noPromise", node: node.callee });
        }
      },
    };
  },
  meta: {
    docs: { description: "Disallow raw Promise and async orchestration." },
    messages: {
      noAsync: "Return an Effect program instead of declaring an async function.",
      noAwait: "Compose Effect programs instead of awaiting raw Promises.",
      noPromise: "Use Effect.async, Effect.promise or Effect.tryPromise at the host boundary.",
      noPromiseType: "Expose an Effect result instead of a raw Promise type.",
    },
    type: "problem",
  },
});

const noInstanceof = defineRule({
  create(context) {
    return {
      BinaryExpression(node) {
        if (node.operator === "instanceof") {
          context.report({ messageId: "noInstanceof", node });
        }
      },
    };
  },
  meta: {
    docs: { description: "Disallow instanceof checks in Effect-owned TypeScript." },
    messages: {
      noInstanceof: "Use tagged data, Schema guards or Effect matchers instead of instanceof.",
    },
    type: "problem",
  },
});

const isManualTagKey = (node: ESTree.Node) => {
  const parent = node?.parent;
  if (!Option.contains(propertyName(node), "_tag")) {
    return false;
  }
  if (parent?.type === "MemberExpression") {
    return parent.property === node;
  }
  if (
    parent?.type === "Property" ||
    parent?.type === "PropertyDefinition" ||
    parent?.type === "TSPropertySignature"
  ) {
    return parent.key === node;
  }
  return false;
};

const noManualTag = defineRule({
  create(context) {
    const reportTag = (node: ESTree.Node) => {
      if (isManualTagKey(node)) {
        context.report({ messageId: "noManualTag", node });
      }
    };
    return {
      Identifier: reportTag,
      Literal: reportTag,
    };
  },
  meta: {
    docs: { description: "Disallow manual Effect tag definitions and checks." },
    messages: {
      noManualTag:
        "Use Data or Schema tagged classes to define variants, then use Match, Schema.is or the matching Effect primitive to inspect them.",
    },
    type: "problem",
  },
});

const RuntimeOptions = Schema.Struct({ allowedFiles: Schema.Array(Schema.String) });

const noRuntimeExecutionOutsideMain = defineRule({
  meta: {
    type: "problem",
    schema: [
      {
        type: "object",
        properties: { allowedFiles: { type: "array", items: { type: "string", minLength: 1 } } },
        required: ["allowedFiles"],
        additionalProperties: false,
      },
    ],
    docs: { description: "Restrict Effect runtime execution to configured entry files." },
    messages: {
      noRuntimeExecutionOutsideMain:
        "Only configured entry files may execute the Effect runtime. Packages return Effect programs.",
    },
  },
  create(context) {
    // Oxlint requires a synchronous create callback; invalid options stop linting.
    const options = Schema.decodeUnknownSync(RuntimeOptions)(
      Option.getOrElse(Array.head(context.options), () => ({ allowedFiles: [] })),
    );
    const filename = context.filename.replaceAll("\\", "/");
    const cwd = context.cwd.replaceAll("\\", "/").replace(/\/$/u, "");
    const relative = filename.startsWith(`${cwd}/`) ? filename.slice(cwd.length + 1) : filename;
    const isMain = Array.contains(options.allowedFiles, relative);
    return {
      CallExpression(node) {
        if (node.callee.type !== "MemberExpression" || node.callee.object.type !== "Identifier")
          return;
        const object = node.callee.object.name;
        const method = propertyName(node.callee.property);
        const isRunner = Option.exists(
          method,
          (name) =>
            (object === "Effect" && name.startsWith("run")) ||
            ((object === "BunRuntime" || object === "NodeRuntime") && name === "runMain"),
        );
        if (isRunner && !isMain)
          context.report({ messageId: "noRuntimeExecutionOutsideMain", node: node.callee });
      },
    };
  },
});

export default {
  meta: { name: "effect" },
  rules: {
    "no-ambient-process": noAmbientProcess,
    "no-async-await-promise": noAsyncAwaitPromise,
    "no-console": noConsole,
    "no-instanceof": noInstanceof,
    "no-manual-tag": noManualTag,
    "no-raw-fetch": noRawFetch,
    "no-runtime-execution-outside-main": noRuntimeExecutionOutsideMain,
    "no-unchecked-json": noUncheckedJson,
    "require-service-operation-instrumentation": requireServiceOperationInstrumentation,
  },
};
