import type { Context, ESTree, Scope, Variable } from "@oxlint/plugins";
import { Array, Option, Predicate, Record, Schema } from "effect";

export const propertyName = (node: ESTree.Node): Option.Option<string> => {
  if (node.type === "Identifier") return Option.some(node.name);
  if (node.type === "Literal" && Predicate.isString(node.value)) return Option.some(node.value);
  return Option.none();
};

export const variableInScope = (scope: Scope, name: string): Option.Option<Variable> =>
  Array.findFirst(scope.variables, (variable) => variable.name === name).pipe(
    Option.orElse(() =>
      Option.fromNullishOr(scope.upper).pipe(
        Option.flatMap((upper) => variableInScope(upper, name)),
      ),
    ),
  );

const nodeRecord = Schema.is(Schema.Record(Schema.String, Schema.Unknown));
// This adapter only receives Oxlint's parsed tree and its declared child keys.
// Oxlint owns the Node contract; the check selects nodes from nullable child slots.
const HostNode = Schema.declare<ESTree.Node>(
  (value): value is ESTree.Node => nodeRecord(value) && Predicate.isString(value.type),
);
const isHostNode = Schema.is(HostNode);
const isChildren = Schema.is(Schema.Array(Schema.NullOr(HostNode)));

export const childNodes = (context: Context, node: ESTree.Node): readonly ESTree.Node[] => {
  if (!nodeRecord(node)) return [];
  return Array.flatMap(
    Option.getOrElse(Record.get(context.sourceCode.visitorKeys, node.type), () => []),
    (key) => {
      const value = Record.get(node, key);
      return Option.match(value, {
        onNone: () => [],
        onSome: (child) =>
          isHostNode(child) ? [child] : isChildren(child) ? Array.filter(child, isHostNode) : [],
      });
    },
  );
};
