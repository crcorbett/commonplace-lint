import { defineRule } from "@oxlint/plugins";
import type { Context, ESTree } from "@oxlint/plugins";
import { Array, Option } from "effect";
import { isFunction, memberName, testFile } from "../conventions/shared.js";
import { propertyName } from "../syntax.js";
import { curried, effectModule, isArgument } from "./syntax.js";

const layerModule = "effect/Layer";
const constructors = [
  "succeed",
  "succeedContext",
  "sync",
  "syncContext",
  "effect",
  "effectContext",
  "effectDiscard",
  "fromBuild",
  "fromBuildMemo",
];
// Native constructors and combinators whose callbacks or Effects run once while
// the Layer itself is built, rather than on every operation call.
const boundaries = [
  "effect",
  "effectContext",
  "effectDiscard",
  "sync",
  "syncContext",
  "suspend",
  "unwrap",
  "flatMap",
  "fromBuild",
  "fromBuildMemo",
];

const named = (name: Option.Option<string>, names: readonly string[]) =>
  Option.exists(name, (value) => Array.contains(names, value));

const boundary = (context: Context, call: ESTree.CallExpression) =>
  named(memberName(context, call.callee, layerModule), boundaries) ||
  named(curried(context, call, layerModule), boundaries);

// Effect.gen, Effect.fn and Effect.fnUntraced bodies are operations.
const operationBody = (
  context: Context,
  node: ESTree.Node,
): Option.Option<ESTree.CallExpression> => {
  const parent = node.parent;
  if (!isFunction(node) || parent?.type !== "CallExpression" || !isArgument(parent, node))
    return Option.none();
  const direct = memberName(context, parent.callee, effectModule);
  return named(direct, ["gen", "fn", "fnUntraced"]) ||
    named(curried(context, parent, effectModule), ["fn", "fnUntraced"])
    ? Option.some(parent)
    : Option.none();
};

// `Layer.unwrap(Effect.gen(...))`, optionally after `.pipe(...)`, builds once.
const builtWithLayer = (context: Context, call: ESTree.CallExpression): boolean => {
  const parent = call.parent;
  if (parent?.type === "CallExpression" && isArgument(parent, call))
    return boundary(context, parent);
  if (
    parent?.type === "MemberExpression" &&
    parent.object === call &&
    Option.contains(propertyName(parent.property), "pipe") &&
    parent.parent.type === "CallExpression" &&
    parent.parent.callee === parent
  )
    return builtWithLayer(context, parent.parent);
  return false;
};

const insideOperation = (
  context: Context,
  child: ESTree.Node,
  node: ESTree.Node | null,
): boolean => {
  if (node === null) return false;
  if (node.type === "CallExpression" && isArgument(node, child) && boundary(context, node))
    return false;
  return operationBody(context, node).pipe(
    Option.match({
      onNone: () => insideOperation(context, node, node.parent),
      onSome: (call) => !builtWithLayer(context, call),
    }),
  );
};

export const noLayerConstructionInOperations = defineRule({
  meta: {
    type: "problem",
    docs: {
      description: "Construct Layers statically instead of inside Effect operation bodies.",
    },
    messages: {
      construction:
        "Do not construct a Layer inside an Effect operation. Declare a static Layer at module level, close dependencies into the live implementation, or pass request values as operation input. Native construction callbacks such as Layer.unwrap remain valid.",
    },
  },
  create(context) {
    // Tests may build replacement Layers around per-test observations.
    if (testFile(context.filename)) return {};
    return {
      CallExpression(node) {
        if (!named(memberName(context, node.callee, layerModule), constructors)) return;
        if (insideOperation(context, node, node.parent))
          context.report({ node, messageId: "construction" });
      },
    };
  },
});
