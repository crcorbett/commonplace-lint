import { defineRule } from "@oxlint/plugins";
import type { Context, ESTree, Variable } from "@oxlint/plugins";
import { Array, Option } from "effect";
import { constant, operation, referenceOf, valueOf } from "./native-reference.js";
import { childNodes, propertyName, variableInScope } from "./syntax.js";

const reducers = ["Array", "Chunk", "HashMap", "HashSet", "Record", "Effect"];
const isFunction = (node: ESTree.Node): node is ESTree.ArrowFunctionExpression | ESTree.Function =>
  node.type === "ArrowFunctionExpression" ||
  node.type === "FunctionExpression" ||
  node.type === "FunctionDeclaration";

const callbackOf = (
  context: Context,
  node: ESTree.Node,
  visited: readonly ESTree.Node[] = [],
): Option.Option<ESTree.Node> => {
  if (Array.some(visited, (entry) => entry === node)) return Option.none();
  if (isFunction(node)) return Option.some(node);
  if (node.type !== "Identifier") return Option.none();
  const next = [...visited, node];
  return variableInScope(context.sourceCode.getScope(node), node.name).pipe(
    Option.flatMap((variable) =>
      constant(variable).pipe(
        Option.flatMap((declaration) => Option.fromNullishOr(declaration.init)),
        Option.flatMap((value) => callbackOf(context, value, next)),
        Option.orElse(() =>
          Array.head(variable.defs).pipe(
            Option.filter(() => Array.every(variable.references, (entry) => !entry.isWrite())),
            Option.map((definition) => definition.node),
            Option.filter(isFunction),
          ),
        ),
      ),
    ),
  );
};

type Identifier = Extract<ESTree.Node, { type: "Identifier" }>;
const bindings = (node: ESTree.Node): readonly Identifier[] => {
  if (node.type === "Identifier") return [node];
  if (node.type === "AssignmentPattern") return bindings(node.left);
  if (node.type === "RestElement") return bindings(node.argument);
  if (node.type === "ObjectPattern")
    return Array.flatMap<ESTree.Node, Identifier>(node.properties, (property) =>
      property.type === "Property"
        ? bindings(property.value)
        : property.type === "RestElement"
          ? bindings(property.argument)
          : [],
    );
  if (node.type === "ArrayPattern")
    return Array.flatMap<ESTree.Node | null, Identifier>(node.elements, (element) =>
      element === null ? [] : bindings(element),
    );
  return [];
};

// Compare bindings, not names: a nested parameter called `acc` is another value.
// Only immutable local aliases are followed; imported helpers remain opaque.
const accumulator = (
  context: Context,
  node: ESTree.Node,
  variables: readonly Variable[],
  visited: readonly ESTree.Node[] = [],
): boolean => {
  if (Array.some(visited, (entry) => entry === node)) return false;
  const next = [...visited, node];
  if (
    node.type === "TSAsExpression" ||
    node.type === "TSSatisfiesExpression" ||
    node.type === "TSNonNullExpression" ||
    node.type === "ChainExpression"
  )
    return accumulator(context, node.expression, variables, next);
  if (node.type === "MemberExpression") return accumulator(context, node.object, variables, next);
  if (node.type !== "Identifier") return false;
  return variableInScope(context.sourceCode.getScope(node), node.name).pipe(
    Option.exists(
      (variable) =>
        Array.some(variables, (entry) => entry === variable) ||
        constant(variable).pipe(
          Option.flatMap((declaration) => Option.fromNullishOr(declaration.init)),
          Option.exists((value) => accumulator(context, value, variables, next)),
        ),
    ),
  );
};

// The argument count is the installed operation's data-first arity. Persistent
// Chunk/HashMap/HashSet updates share structure and deliberately do not appear.
const copierArity = (context: Context, node: ESTree.Node): Option.Option<number> =>
  referenceOf(context, node).pipe(
    Option.flatMap((reference) =>
      Option.flatMap(reference.name, (name) => {
        if (reference.module === "effect/Array") {
          if (name === "copy") return Option.some(1);
          if (Array.contains(["append", "appendAll", "prepend", "prependAll", "union"], name))
            return Option.some(2);
        }
        if (reference.module === "effect/Record") {
          if (name === "set") return Option.some(3);
          if (name === "union") return Option.some(2);
        }
        return Option.none();
      }),
    ),
  );

const curriedCopier = (context: Context, node: ESTree.Node): boolean => {
  const resolved = Option.getOrElse(valueOf(context, node), () => node);
  if (resolved.type !== "CallExpression") return Option.contains(copierArity(context, resolved), 1);
  return copierArity(context, resolved.callee).pipe(
    Option.exists((arity) => arity > 1 && resolved.arguments.length === arity - 1),
  );
};

export const noCopyingAccumulator = defineRule({
  meta: {
    type: "problem",
    schema: [],
    docs: { description: "Reject repeated accumulator copies without recommending mutation." },
    messages: {
      copying:
        "Copying the growing result on every step can make a small input very slow. Use Effect Array.map/flatMap, Record.fromEntries, Chunk.append, HashMap.set or HashSet.add. Keep old values unchanged; do not use push, Object.assign or mutable builders.",
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        const reducer = referenceOf(context, node.callee).pipe(
          Option.exists(
            (reference) =>
              Array.some(reducers, (module) => reference.module === `effect/${module}`) &&
              Option.exists(reference.name, (name) =>
                Array.contains(["reduce", "reduceRight", "scan", "scanRight"], name),
              ),
          ),
        );
        if (!reducer || node.arguments.length < 2) return;
        const argument = Array.get(node.arguments, node.arguments.length >= 3 ? 2 : 1);
        const callback = Option.flatMap(argument, (value) => callbackOf(context, value));
        if (Option.isNone(callback) || !isFunction(callback.value)) return;
        const first = Array.head(callback.value.params);
        const variables = first.pipe(
          Option.map((parameter) =>
            Array.flatMap(bindings(parameter), (binding) =>
              Option.toArray(variableInScope(context.sourceCode.getScope(binding), binding.name)),
            ),
          ),
          Option.getOrElse(() => []),
        );
        const report = (copy: ESTree.Node) => context.report({ node: copy, messageId: "copying" });
        const isAccumulator = (value: ESTree.Node) => accumulator(context, value, variables);
        const inspect = (value: ESTree.Node): void => {
          // A fixed-shape object update is bounded. Dynamic keys or another
          // spread can grow the copied record with each incoming element.
          if (
            value.type === "SpreadElement" &&
            (value.parent.type === "ArrayExpression" ||
              (value.parent.type === "ObjectExpression" &&
                Array.some(
                  value.parent.properties,
                  (property) =>
                    (property.type === "Property" &&
                      property.computed &&
                      property.key.type !== "Literal") ||
                    (property.type === "SpreadElement" && property !== value),
                ))) &&
            isAccumulator(value.argument)
          )
            report(value);
          if (value.type === "CallExpression") {
            if (
              copierArity(context, value.callee).pipe(
                Option.exists((arity) => value.arguments.length >= arity),
              ) &&
              Array.head(value.arguments).pipe(Option.exists(isAccumulator))
            )
              report(value);
            if (
              value.callee.type === "CallExpression" &&
              curriedCopier(context, value.callee) &&
              Array.head(value.arguments).pipe(Option.exists(isAccumulator))
            )
              report(value);
            const pipe =
              operation(context, value.callee, "effect/Function", "pipe") ||
              operation(context, value.callee, "effect", "pipe");
            const method =
              value.callee.type === "MemberExpression" &&
              Option.contains(propertyName(value.callee.property), "pipe") &&
              isAccumulator(value.callee.object);
            const transforms = method ? value.arguments : Array.drop(value.arguments, 1);
            if (method || (pipe && Array.head(value.arguments).pipe(Option.exists(isAccumulator))))
              Array.head(transforms).pipe(
                Option.map((transform) => {
                  if (curriedCopier(context, transform)) report(transform);
                }),
              );
          }
          Array.forEach(childNodes(context, value), inspect);
        };
        if (callback.value.body) inspect(callback.value.body);
      },
    };
  },
});
