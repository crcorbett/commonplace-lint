import type { Context, ESTree } from "@oxlint/plugins";
import { Array, Option } from "effect";
import { constant, operation, valueOf } from "./native-reference.js";
import { propertyName, variableInScope } from "./syntax.js";

export type Channel = "exitCode" | "stdout" | "stderr";
export interface Capture {
  readonly handle: ESTree.Node;
  readonly channel: Channel;
}
export const memberName = (node: ESTree.MemberExpression) =>
  node.computed && node.property.type !== "Literal" ? Option.none() : propertyName(node.property);

// A type annotation or a lookalike spawn method never establishes provider identity.
const processHandle = (context: Context, expression: ESTree.Node) =>
  valueOf(context, expression).pipe(
    Option.filter((node) => node.type === "YieldExpression"),
    Option.filter((node) => node.delegate),
    Option.flatMap((node) => Option.fromNullishOr(node.argument)),
    Option.filter((node) => node.type === "CallExpression"),
    Option.filter(
      (node) =>
        node.callee.type === "MemberExpression" &&
        Option.contains(memberName(node.callee), "spawn"),
    ),
    Option.filter(
      (node) =>
        node.callee.type === "MemberExpression" &&
        valueOf(context, node.callee.object).pipe(
          Option.filter((value) => value.type === "YieldExpression"),
          Option.filter((value) => value.delegate),
          Option.flatMap((value) => Option.fromNullishOr(value.argument)),
          Option.exists((service) =>
            operation(
              context,
              service,
              "effect/process/ChildProcessSpawner",
              "ChildProcessSpawner",
            ),
          ),
        ),
    ),
  );

const field = (context: Context, expression: ESTree.Node, name: string) =>
  valueOf(context, expression).pipe(
    Option.filter((node) => node.type === "ObjectExpression"),
    Option.filter((node) =>
      Array.every(
        node.properties,
        (property) =>
          property.type === "Property" &&
          property.kind === "init" &&
          !property.computed &&
          !Option.contains(propertyName(property.key), "__proto__"),
      ),
    ),
    Option.flatMap((node) =>
      Array.findLast(
        node.properties,
        (property) =>
          property.type === "Property" && Option.contains(propertyName(property.key), name),
      ),
    ),
    Option.filter((property) => property.type === "Property"),
    Option.flatMap((property) => valueOf(context, property.value)),
  );
export const nonPipe = (context: Context, handle: ESTree.Node, channel: Channel): boolean => {
  if (channel === "exitCode" || handle.type !== "CallExpression") return false;
  const command = Array.head(handle.arguments).pipe(
    Option.flatMap((node) => valueOf(context, node)),
  );
  const options = command.pipe(
    Option.flatMap((node) => {
      if (
        node.type === "TaggedTemplateExpression" &&
        node.tag.type === "CallExpression" &&
        operation(context, node.tag.callee, "effect/process/ChildProcess", "make")
      )
        return Array.head(node.tag.arguments);
      if (
        node.type !== "CallExpression" ||
        !operation(context, node.callee, "effect/process/ChildProcess", "make")
      )
        return Option.none();
      // A known options object retains the native two-argument form. Otherwise
      // the three-argument overload supplies options without requiring a literal
      // argument list: readonly arrays can also come from aliases or conditions.
      return Array.get(node.arguments, 1).pipe(
        Option.flatMap((second) => valueOf(context, second)),
        Option.filter((second) => second.type === "ObjectExpression"),
        Option.orElse(() => Array.get(node.arguments, 2)),
      );
    }),
  );
  return options.pipe(
    Option.flatMap((node) => field(context, node, channel)),
    Option.flatMap((node) =>
      node.type === "ObjectExpression" ? field(context, node, "stream") : Option.some(node),
    ),
    Option.exists(
      (node) => node.type === "Literal" && (node.value === "inherit" || node.value === "ignore"),
    ),
  );
};

export const channelMember = (
  context: Context,
  expression: ESTree.Node,
  visited: readonly ESTree.Node[] = [],
): Option.Option<Capture> => {
  if (Array.some(visited, (node) => node === expression)) return Option.none();
  const next = [...visited, expression];
  if (expression.type === "Identifier") {
    const declaration = variableInScope(
      context.sourceCode.getScope(expression),
      expression.name,
    ).pipe(Option.flatMap(constant));
    return declaration.pipe(
      Option.flatMap((node) => {
        if (node.id.type === "Identifier")
          return Option.fromNullishOr(node.init).pipe(
            Option.flatMap((initialiser) => channelMember(context, initialiser, next)),
          );
        if (node.id.type !== "ObjectPattern" || !node.init) return Option.none();
        const handle = processHandle(context, node.init);
        return Array.findFirst(
          node.id.properties,
          (property) =>
            property.type === "Property" &&
            !property.computed &&
            property.value.type === "Identifier" &&
            property.value.name === expression.name,
        ).pipe(
          Option.filter((property) => property.type === "Property"),
          Option.flatMap((property) => propertyName(property.key)),
          Option.filter(
            (name): name is Channel =>
              name === "exitCode" || name === "stdout" || name === "stderr",
          ),
          Option.flatMap((channel) =>
            Option.map(handle, (process) => ({ handle: process, channel })),
          ),
        );
      }),
    );
  }
  if (expression.type === "TSAsExpression" || expression.type === "TSSatisfiesExpression")
    return channelMember(context, expression.expression, next);
  if (expression.type !== "MemberExpression") return Option.none();
  return memberName(expression).pipe(
    Option.filter(
      (name): name is Channel => name === "exitCode" || name === "stdout" || name === "stderr",
    ),
    Option.flatMap((channel) =>
      Option.map(processHandle(context, expression.object), (handle) => ({ handle, channel })),
    ),
  );
};
