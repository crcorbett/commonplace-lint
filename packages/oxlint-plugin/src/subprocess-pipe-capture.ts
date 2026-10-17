import { defineRule } from "@oxlint/plugins";
import type { Context, ESTree } from "@oxlint/plugins";
import { Array, Option, Predicate } from "effect";
import { operation, valueOf } from "./native-reference.js";
import { propertyName } from "./syntax.js";
import { channelMember, memberName, nonPipe, type Capture } from "./subprocess-capture-dataflow.js";

interface CaptureEvent {
  readonly node: ESTree.Node;
  readonly captures: readonly Capture[];
  readonly completed: readonly ESTree.Node[];
}
const functionNode = (node: ESTree.Node) =>
  node.type === "ArrowFunctionExpression" ||
  node.type === "FunctionExpression" ||
  node.type === "FunctionDeclaration";
const terminalNames = [
  "run",
  "runCollect",
  "runDrain",
  "runFold",
  "runFoldEffect",
  "runForEach",
  "mkString",
];
const streamTerminal = (context: Context, node: ESTree.Node): boolean => {
  if (node.type === "CallExpression") return streamTerminal(context, node.callee);
  return Array.some(terminalNames, (name) => operation(context, node, "effect/Stream", name));
};
const effectAll = (context: Context, node: ESTree.Node) =>
  node.type === "CallExpression" && operation(context, node.callee, "effect/Effect", "all");
const forked = (context: Context, node: ESTree.Node): boolean =>
  node.type === "CallExpression"
    ? forked(context, node.callee)
    : Array.some(["forkChild", "forkScoped", "forkDaemon", "forkDetach"], (name) =>
        operation(context, node, "effect/Effect", name),
      );

const effectTransforms = [
  "map",
  "mapError",
  "as",
  "asVoid",
  "timeout",
  "timeoutOrElse",
  "withSpan",
];
const nativeTransform = (
  context: Context,
  node: ESTree.Node,
  module: string,
  names: readonly string[],
): boolean =>
  node.type === "CallExpression"
    ? nativeTransform(context, node.callee, module, names)
    : Array.some(names, (name) => operation(context, node, module, name));
const effectTransform = (context: Context, node: ESTree.Node) =>
  nativeTransform(context, node, "effect/Effect", effectTransforms);
const streamPipeline = (context: Context, transforms: readonly ESTree.Node[]) =>
  Array.findFirstIndex(transforms, (node) => streamTerminal(context, node)).pipe(
    Option.exists(
      (terminal) =>
        Array.every(Array.take(transforms, terminal), (node) =>
          nativeTransform(context, node, "effect/Stream", [
            "decodeText",
            "map",
            "mapEffect",
            "filter",
            "take",
            "takeWhile",
            "filterMap",
          ]),
        ) &&
        Array.every(Array.drop(transforms, terminal + 1), (node) => effectTransform(context, node)),
    ),
  );

const captures = (
  context: Context,
  node: ESTree.Node,
  visited: readonly ESTree.Node[] = [],
): readonly Capture[] => {
  if (functionNode(node) || Array.some(visited, (seen) => seen === node)) return [];
  const next = [...visited, node];
  const direct = channelMember(context, node).pipe(
    Option.filter((capture) => !nonPipe(context, capture.handle, capture.channel)),
  );
  if (Option.isSome(direct)) return direct.value.channel === "exitCode" ? [direct.value] : [];
  if (node.type === "Identifier")
    return valueOf(context, node).pipe(
      Option.filter((value) => value !== node),
      Option.match({ onNone: () => [], onSome: (value) => captures(context, value, next) }),
    );
  if (node.type !== "CallExpression") return [];
  // Forking already changes execution ownership; this rule does not infer fibre lifetimes.
  if (
    forked(context, node.callee) ||
    Array.some(node.arguments, (argument) => forked(context, argument))
  )
    return [];
  if (node.callee.type === "MemberExpression" && Option.contains(memberName(node.callee), "pipe")) {
    const stream = channelMember(context, node.callee.object).pipe(
      Option.filter((capture) => !nonPipe(context, capture.handle, capture.channel)),
    );
    if (Option.isSome(stream) && stream.value.channel !== "exitCode")
      return streamPipeline(context, node.arguments) ? [stream.value] : [];
    return Array.every(node.arguments, (argument) => effectTransform(context, argument))
      ? captures(context, node.callee.object, next)
      : [];
  }
  if (streamTerminal(context, node.callee))
    return Array.head(node.arguments).pipe(
      Option.flatMap((argument) =>
        channelMember(context, argument).pipe(
          Option.filter(
            (capture) =>
              capture.channel !== "exitCode" && !nonPipe(context, capture.handle, capture.channel),
          ),
        ),
      ),
      Option.toArray,
    );
  if (
    operation(context, node.callee, "effect/Function", "pipe") ||
    operation(context, node.callee, "effect", "pipe")
  ) {
    return Array.head(node.arguments).pipe(
      Option.flatMap((argument) => channelMember(context, argument)),
      Option.filter(
        (capture) =>
          !nonPipe(context, capture.handle, capture.channel) &&
          (capture.channel === "exitCode"
            ? Array.every(Array.drop(node.arguments, 1), (argument) =>
                effectTransform(context, argument),
              )
            : streamPipeline(context, Array.drop(node.arguments, 1))),
      ),
      Option.match({ onNone: () => [], onSome: (capture) => [capture] }),
    );
  }
  // Native Effect wrappers keep their input lazy; arbitrary callbacks are not followed.
  return effectTransform(context, node.callee)
    ? Array.head(node.arguments).pipe(
        Option.match({
          onNone: () => [],
          onSome: (self) => captures(context, self, next),
        }),
      )
    : [];
};

const jobs = (context: Context, node: ESTree.Node) =>
  valueOf(context, node).pipe(
    Option.flatMap((value): Option.Option<readonly ESTree.Node[]> => {
      if (value.type === "ArrayExpression")
        return Array.every(
          value.elements,
          (element) => element !== null && element.type !== "SpreadElement",
        )
          ? Option.some(Array.filter(value.elements, (element) => element !== null))
          : Option.none();
      if (value.type === "ObjectExpression") {
        const names = Array.flatMap(value.properties, (property) =>
          property.type === "Property" ? Option.toArray(propertyName(property.key)) : [],
        );
        if (
          names.length !== value.properties.length ||
          Array.dedupe(names).length !== names.length ||
          Array.some(names, (name) => /^\d+$/.test(name) || name === "__proto__")
        )
          return Option.none();
        return Array.every(
          value.properties,
          (property) =>
            property.type === "Property" &&
            property.kind === "init" &&
            !property.computed &&
            !Option.contains(propertyName(property.key), "__proto__"),
        )
          ? Option.some(
              Array.flatMap(value.properties, (property) =>
                property.type === "Property" ? [property.value] : [],
              ),
            )
          : Option.none();
      }
      return Option.none();
    }),
  );

// Unknown concurrency is deliberately unclassified. Only a missing or statically
// insufficient bound is rejected; this is not a proof of general process safety.
const concurrency = (context: Context, call: ESTree.CallExpression): Option.Option<number> =>
  Array.get(call.arguments, 1).pipe(
    Option.match({
      onNone: () => Option.some(1),
      onSome: (options) =>
        valueOf(context, options).pipe(
          Option.filter((value) => value.type === "ObjectExpression"),
          Option.filter((value) =>
            Array.every(
              value.properties,
              (property) =>
                property.type === "Property" &&
                property.kind === "init" &&
                !property.computed &&
                !Option.contains(propertyName(property.key), "__proto__"),
            ),
          ),
          Option.flatMap((value) =>
            Array.findLast(
              value.properties,
              (property) =>
                property.type === "Property" &&
                Option.contains(propertyName(property.key), "concurrency"),
            ).pipe(
              Option.match({
                onNone: () => Option.some(1),
                onSome: (property) =>
                  property.type === "Property"
                    ? valueOf(context, property.value).pipe(
                        Option.filter((setting) => setting.type === "Literal"),
                        Option.flatMap((setting) =>
                          setting.value === "unbounded"
                            ? Option.some(Number.POSITIVE_INFINITY)
                            : Predicate.isNumber(setting.value)
                              ? Option.some(setting.value)
                              : Option.none(),
                        ),
                      )
                    : Option.none(),
              }),
            ),
          ),
        ),
    }),
  );
const conflicts = (left: Capture, right: Capture) =>
  left.handle === right.handle && left.channel !== right.channel;
const waitingCapture = (context: Context, tasks: readonly ESTree.Node[], bound: number) => {
  const indexed = Array.flatMap(tasks, (task, index) =>
    Array.map(captures(context, task), (capture) => ({ capture, index })),
  );
  return Array.some(indexed, ({ capture }) => {
    const related = Array.filter(indexed, (entry) => entry.capture.handle === capture.handle);
    return (
      Array.some(related, (entry) => entry.index < bound) &&
      Array.some(related, (entry) => conflicts(capture, entry.capture)) &&
      Array.some(related, (entry) => entry.capture.channel !== "exitCode" && entry.index >= bound)
    );
  });
};

const yielded = (node: ESTree.Statement): readonly ESTree.YieldExpression[] => {
  if (node.type === "ExpressionStatement" || node.type === "ReturnStatement") {
    const expression = node.type === "ExpressionStatement" ? node.expression : node.argument;
    return expression?.type === "YieldExpression" && expression.delegate ? [expression] : [];
  }
  return node.type === "VariableDeclaration"
    ? Array.flatMap(node.declarations, (declaration) =>
        declaration.init?.type === "YieldExpression" && declaration.init.delegate
          ? [declaration.init]
          : [],
      )
    : [];
};
const event = (context: Context, node: ESTree.YieldExpression): CaptureEvent => {
  if (node.argument?.type === "CallExpression" && effectAll(context, node.argument)) {
    const call = node.argument;
    const entries = Array.head(call.arguments).pipe(
      Option.flatMap((input) => jobs(context, input)),
    );
    return Option.match(entries, {
      onNone: () => ({ node, captures: [], completed: [] }),
      onSome: (tasks) => {
        const consumed = Array.flatMap(tasks, (task) => captures(context, task));
        return {
          node,
          captures: consumed,
          // This group has returned before the next yield. Finished pipe drains
          // may safely precede a later exit wait, regardless of their old bound.
          completed: Array.flatMap(consumed, (capture) =>
            Array.every(
              ["stdout", "stderr"] as const,
              (channel) =>
                nonPipe(context, capture.handle, channel) ||
                Array.some(
                  consumed,
                  (other) => other.handle === capture.handle && other.channel === channel,
                ),
            )
              ? [capture.handle]
              : [],
          ),
        };
      },
    });
  }
  return { node, captures: node.argument ? captures(context, node.argument) : [], completed: [] };
};
const nativeGenerator = (context: Context, block: ESTree.BlockStatement) => {
  const fn = block.parent;
  if ((fn?.type !== "FunctionExpression" && fn?.type !== "FunctionDeclaration") || !fn.generator)
    return false;
  const call = fn.parent;
  if (call?.type !== "CallExpression") return false;
  return (
    operation(context, call.callee, "effect/Effect", "gen") ||
    operation(context, call.callee, "effect/Effect", "fnUntraced") ||
    (call.callee.type === "CallExpression" &&
      operation(context, call.callee.callee, "effect/Effect", "fn"))
  );
};

export const subprocessPipeCapture = defineRule({
  meta: {
    type: "problem",
    schema: [],
    messages: {
      capture:
        "Drain a subprocess's captured pipes while waiting for exit. Use explicit Effect.all concurrency that starts the required pipe drains together; sequential collection can block on a full OS pipe.",
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        if (!effectAll(context, node)) return;
        const entries = Array.head(node.arguments).pipe(
          Option.flatMap((input) => jobs(context, input)),
        );
        if (
          Option.exists(entries, (tasks) =>
            Option.exists(concurrency(context, node), (bound) =>
              waitingCapture(context, tasks, bound),
            ),
          )
        )
          context.report({ node, messageId: "capture" });
      },
      "BlockStatement:exit"(node) {
        if (!nativeGenerator(context, node)) return;
        const events = Array.map(Array.flatMap(node.body, yielded), (yielded) =>
          event(context, yielded),
        );
        Array.forEach(events, (current, index) => {
          const previous = Array.take(events, index);
          const closed = Array.flatMap(previous, (entry) => entry.completed);
          if (
            Array.some(previous, (earlier) =>
              Array.some(
                earlier.captures,
                (left) =>
                  !Array.some(closed, (handle) => handle === left.handle) &&
                  Array.some(
                    current.captures,
                    (right) =>
                      conflicts(left, right) &&
                      (left.channel === "exitCode" ||
                        right.channel !== "exitCode" ||
                        !nonPipe(
                          context,
                          left.handle,
                          left.channel === "stdout" ? "stderr" : "stdout",
                        )),
                  ),
              ),
            )
          )
            context.report({ node: current.node, messageId: "capture" });
        });
      },
    };
  },
});
