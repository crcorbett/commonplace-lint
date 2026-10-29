import { defineRule, type Context, type ESTree } from "@oxlint/plugins";
import { Array, Option } from "effect";
import { constant, operation, referenceOf, valueOf } from "./native-reference.js";
import { propertyName, variableInScope } from "./syntax.js";

// Only prove unconditional constructor results. Conditional cause checks and
// opaque helpers need behavioural tests; this rule does not infer their meaning.
const constructedError = (
  context: Context,
  input: ESTree.Node,
  visited: readonly ESTree.Node[] = [],
): Option.Option<ESTree.Node> => {
  if (Array.some(visited, (previous) => previous === input)) return Option.none();
  const next = [...visited, input];
  return valueOf(context, input).pipe(
    Option.flatMap((node) => {
      if (node.type === "NewExpression") return Option.some(node.callee);
      if (node.type === "ArrowFunctionExpression" || node.type === "FunctionExpression") {
        const body = node.body;
        if (!body) return Option.none();
        if (body.type !== "BlockStatement") return constructedError(context, body, next);
        return Array.head(body.body).pipe(
          Option.filter(() => body.body.length === 1),
          Option.filter((statement) => statement.type === "ReturnStatement"),
          Option.flatMap((statement) => Option.fromNullishOr(statement.argument)),
          Option.flatMap((result) => constructedError(context, result, next)),
        );
      }
      if (node.type !== "CallExpression") return Option.none();
      if (
        operation(context, node.callee, "effect/Effect", "fail") ||
        operation(context, node.callee, "effect/Effect", "succeed")
      )
        return Array.head(node.arguments).pipe(
          Option.flatMap((argument) => constructedError(context, argument, next)),
        );
      return constructedError(context, node.callee, next);
    }),
  );
};

const localClass = (
  context: Context,
  node: ESTree.Node,
  visited: readonly ESTree.Node[] = [],
): Option.Option<ESTree.Node> => {
  if (Array.some(visited, (previous) => previous === node)) return Option.none();
  if (node.type === "ClassExpression") return Option.some(node);
  if (node.type !== "Identifier") return Option.none();
  return variableInScope(context.sourceCode.getScope(node), node.name).pipe(
    Option.filter((variable) =>
      Array.every(variable.references, (reference) => !reference.isWrite() || reference.init),
    ),
    Option.flatMap((variable) =>
      constant(variable).pipe(
        Option.flatMap((declaration) => Option.fromNullishOr(declaration.init)),
        Option.flatMap((initialiser) => localClass(context, initialiser, [...visited, node])),
        Option.orElse(() =>
          Array.head(variable.defs).pipe(
            Option.filter(() => variable.defs.length === 1),
            Option.map((definition) => definition.node),
            Option.filter((definition) => definition.type === "ClassDeclaration"),
          ),
        ),
      ),
    ),
  );
};

const differentConstructors = (context: Context, left: ESTree.Node, right: ESTree.Node) => {
  const imported = Option.all([referenceOf(context, left), referenceOf(context, right)]);
  if (Option.isSome(imported)) {
    const [a, b] = imported.value;
    return (
      a.module !== b.module || !Option.makeEquivalence<string>((x, y) => x === y)(a.name, b.name)
    );
  }
  return Option.exists(
    Option.all([localClass(context, left), localClass(context, right)]),
    ([a, b]) => a !== b,
  );
};

const handler = (table: ESTree.ObjectExpression, name: string) =>
  Array.findLast(
    table.properties,
    (property) => property.type === "Property" && Option.contains(propertyName(property.key), name),
  ).pipe(
    Option.flatMap((property) =>
      property.type === "Property" ? Option.some(property.value) : Option.none(),
    ),
  );

export const httpClientErrorClassification = defineRule({
  meta: {
    type: "problem",
    schema: [],
    messages: {
      classification:
        "HTTP DecodeError also covers failed response-body reads. Use the TransportError recovery path unless you inspect a separately tagged payload failure; do not classify every DecodeError as a different domain error.",
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        if (
          !operation(context, node.callee, "effect/Match", "tags") &&
          !operation(context, node.callee, "effect/Match", "tagsExhaustive")
        )
          return;
        const table = Array.head(node.arguments).pipe(
          Option.flatMap((argument) => valueOf(context, argument)),
          Option.filter((value) => value.type === "ObjectExpression"),
          // Do not guess which handler an unresolved spread/computed key replaces.
          Option.filter((value) =>
            Array.every(
              value.properties,
              (property) =>
                property.type === "Property" &&
                (!property.computed || property.key.type === "Literal"),
            ),
          ),
        );
        Option.match(table, {
          onNone: () => {},
          onSome: (table) => {
            // This distinctive native reason table avoids domain DecodeError
            // unions and does not depend on project-specific error names.
            if (Option.isNone(handler(table, "StatusCodeError"))) return;
            const handlers = Option.all([
              handler(table, "DecodeError"),
              handler(table, "TransportError"),
            ]);
            Option.match(handlers, {
              onNone: () => {},
              onSome: ([decode, transport]) => {
                const errors = Option.all([
                  constructedError(context, decode),
                  constructedError(context, transport),
                ]);
                if (
                  Option.exists(errors, ([left, right]) =>
                    differentConstructors(context, left, right),
                  )
                )
                  context.report({ node: decode, messageId: "classification" });
              },
            });
          },
        });
      },
    };
  },
});
