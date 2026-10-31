import { defineRule } from "@oxlint/plugins";
import type { Context, ESTree } from "@oxlint/plugins";
import { Array, Option } from "effect";
import { constant, operation, valueOf } from "./native-reference.js";
import { childNodes, propertyName, variableInScope } from "./syntax.js";

const module = "effect/reactivity/Atom";
// Minimum total arguments for the installed native data-first constructors.
// Curried combinators are checked after their final application, not before.
const constructors: readonly (readonly [string, number])[] = [
  ["make", 1],
  ["readable", 1],
  ["writable", 2],
  ["runtime", 1],
  ["family", 1],
  ["fn", 1],
  ["fnSync", 1],
  ["subscriptionRef", 1],
  ["pull", 1],
  ["kvs", 1],
  ["searchParam", 1],
  ["optimistic", 1],
  ["optimisticFn", 2],
  ["transform", 2],
  ["map", 2],
  ["mapResult", 2],
  ["debounce", 2],
  ["swr", 2],
  ["withFallback", 2],
  ["withRefresh", 2],
  ["withEquality", 2],
  ["withLabel", 2],
  ["setIdleTTL", 2],
  ["setLazy", 2],
  ["keepAlive", 1],
  ["autoDispose", 1],
  ["serializable", 2],
  ["withServerValue", 2],
  ["withServerValueInitial", 1],
];
const atomTypes = ["Atom", "Writable", "AtomRuntime", "AtomResultFn", "WithoutSerializable"];
const runtimeMethods = ["atom", "fn", "pull", "subscriptionRef"];

// Type-only imports count for annotations, but never establish a value import.
const typeName = (context: Context, node: ESTree.Node): Option.Option<string> => {
  if (node.type === "TSQualifiedName") {
    return typeName(context, node.left).pipe(Option.map((left) => `${left}/${node.right.name}`));
  }
  if (node.type !== "Identifier") return Option.none();
  return variableInScope(context.sourceCode.getScope(node), node.name).pipe(
    Option.flatMap((variable) => Array.head(variable.defs)),
    Option.flatMap((definition) => {
      if (definition.type !== "ImportBinding" || definition.parent?.type !== "ImportDeclaration")
        return Option.none();
      const source = definition.parent.source.value;
      if (definition.node.type === "ImportNamespaceSpecifier") return Option.some(source);
      if (definition.node.type !== "ImportSpecifier") return Option.none();
      return propertyName(definition.node.imported).pipe(Option.map((name) => `${source}/${name}`));
    }),
  );
};

const hasType = (
  context: Context,
  type: ESTree.Node,
  names: readonly string[],
  visited: readonly ESTree.Node[] = [],
): boolean => {
  if (Array.contains(visited, type)) return false;
  const next = [...visited, type];
  if (type.type === "TSUnionType" || type.type === "TSIntersectionType")
    return Array.some(type.types, (member) => hasType(context, member, names, next));
  if (type.type !== "TSTypeReference") return false;
  if (
    typeName(context, type.typeName).pipe(
      Option.exists((name) =>
        Array.some(
          names,
          (suffix) =>
            name === `${module}/${suffix}` || name === `@effect/atom-react/Atom/${suffix}`,
        ),
      ),
    )
  )
    return true;
  if (type.typeName.type !== "Identifier") return false;
  return variableInScope(context.sourceCode.getScope(type.typeName), type.typeName.name).pipe(
    Option.flatMap((variable) => Array.head(variable.defs)),
    Option.exists(
      (definition) =>
        definition.node.type === "TSTypeAliasDeclaration" &&
        hasType(context, definition.node.typeAnnotation, names, next),
    ),
  );
};

const typedValue = (context: Context, node: ESTree.Node, names: readonly string[]): boolean => {
  if (node.type !== "Identifier") return false;
  return variableInScope(context.sourceCode.getScope(node), node.name).pipe(
    Option.flatMap((variable) => Array.head(variable.defs)),
    Option.exists((definition) => {
      const binding =
        definition.node.type === "VariableDeclarator" ? definition.node.id : definition.name;
      return (
        binding.type === "Identifier" &&
        Option.fromNullishOr(binding.typeAnnotation).pipe(
          Option.exists((annotation) => hasType(context, annotation.typeAnnotation, names)),
        )
      );
    }),
  );
};

const runtimeValue = (
  context: Context,
  node: ESTree.Node,
  visited: readonly ESTree.Node[] = [],
): boolean => {
  if (Array.contains(visited, node)) return false;
  if (typedValue(context, node, ["AtomRuntime"])) return true;
  if (node.type === "CallExpression") return operation(context, node.callee, module, "runtime");
  if (node.type !== "Identifier") return false;
  return variableInScope(context.sourceCode.getScope(node), node.name).pipe(
    Option.flatMap(constant),
    Option.flatMap((declaration) => Option.fromNullishOr(declaration.init)),
    Option.exists((initialiser) => runtimeValue(context, initialiser, [...visited, node])),
  );
};

const atomCall = (context: Context, callee: ESTree.Node, count: number): boolean => {
  if (
    Array.some(
      constructors,
      ([name, minimum]) => count >= minimum && operation(context, callee, module, name),
    )
  )
    return true;
  const resolved = valueOf(context, callee).pipe(Option.getOrElse(() => callee));
  if (resolved.type === "MemberExpression")
    return (
      (!resolved.computed || resolved.property.type === "Literal") &&
      propertyName(resolved.property).pipe(
        Option.exists((name) => Array.contains(runtimeMethods, name)),
      ) &&
      count >= 1 &&
      runtimeValue(context, resolved.object)
    );
  if (callee.type === "Identifier" && count >= 1)
    return variableInScope(context.sourceCode.getScope(callee), callee.name).pipe(
      Option.flatMap(constant),
      Option.exists(
        (declaration) =>
          declaration.id.type === "ObjectPattern" &&
          Option.fromNullishOr(declaration.init).pipe(
            Option.exists((initialiser) => runtimeValue(context, initialiser)),
          ) &&
          Array.some(
            declaration.id.properties,
            (property) =>
              property.type === "Property" &&
              !property.computed &&
              property.value.type === "Identifier" &&
              property.value.name === callee.name &&
              propertyName(property.key).pipe(
                Option.exists((name) => Array.contains(runtimeMethods, name)),
              ),
          ),
      ),
    );
  return false;
};

const isFunction = (node: ESTree.Node) =>
  node.type === "ArrowFunctionExpression" ||
  node.type === "FunctionExpression" ||
  node.type === "FunctionDeclaration";

const returnsAtom = (context: Context, node: ESTree.Node): boolean => {
  if (node.type === "ReturnStatement")
    return Option.fromNullishOr(node.argument).pipe(
      Option.exists((argument) => atomExpression(context, argument)),
    );
  if (isFunction(node)) return false;
  return Array.some(childNodes(context, node), (child) => returnsAtom(context, child));
};

const atomExpression = (
  context: Context,
  node: ESTree.Node,
  visited: readonly ESTree.Node[] = [],
): boolean => {
  if (Array.contains(visited, node)) return false;
  const next = [...visited, node];
  if (typedValue(context, node, atomTypes)) return true;
  if (node.type === "Identifier")
    return valueOf(context, node).pipe(
      Option.exists((value) => atomExpression(context, value, next)),
    );
  if (node.type === "TSAsExpression" || node.type === "TSSatisfiesExpression")
    return atomExpression(context, node.expression, next);
  if (node.type === "ConditionalExpression")
    return (
      atomExpression(context, node.consequent, next) ||
      atomExpression(context, node.alternate, next)
    );
  if (node.type === "CallExpression") {
    // transform(f, options) is still data-last despite having two arguments.
    const partialTransform =
      operation(context, node.callee, module, "transform") &&
      node.arguments.length === 2 &&
      Array.head(node.arguments).pipe(
        Option.flatMap((argument) => valueOf(context, argument)),
        Option.exists(isFunction),
      );
    if (!partialTransform && atomCall(context, node.callee, node.arguments.length)) return true;
    if (node.callee.type === "CallExpression")
      return atomCall(
        context,
        node.callee.callee,
        node.arguments.length + node.callee.arguments.length,
      );
    if (
      node.callee.type === "MemberExpression" &&
      !node.callee.computed &&
      Option.contains(propertyName(node.callee.property), "pipe")
    ) {
      // A pipe can turn an Atom into an Effect or a tuple. Only a known final
      // Atom combinator preserves an Atom result; an empty pipe is identity.
      const input = node.callee.object;
      return Array.last(node.arguments).pipe(
        Option.match({
          onNone: () => atomExpression(context, input, next),
          onSome: (last) =>
            last.type === "CallExpression"
              ? atomCall(context, last.callee, last.arguments.length + 1)
              : atomCall(context, last, 1),
        }),
      );
    }
    if (operation(context, node.callee, "effect/Function", "pipe")) {
      return Array.last(node.arguments).pipe(
        Option.exists((last) =>
          node.arguments.length === 1
            ? atomExpression(context, last, next)
            : last.type === "CallExpression"
              ? atomCall(context, last.callee, last.arguments.length + 1)
              : atomCall(context, last, 1),
        ),
      );
    }
  }
  return false;
};

export const staticAtoms = defineRule({
  meta: {
    type: "problem",
    schema: [],
    messages: {
      factory:
        "Declare a static Atom. Supply configuration through input Atoms and registry initialValues; use a static Atom.family for keyed definitions. The registry owns values and cleanup.",
    },
  },
  create(context) {
    const checkSignature = (
      node: ESTree.TSFunctionType | ESTree.TSMethodSignature | ESTree.TSCallSignatureDeclaration,
    ) => {
      if (
        Option.fromNullishOr(node.returnType).pipe(
          Option.exists((annotation) => hasType(context, annotation.typeAnnotation, atomTypes)),
        )
      )
        context.report({ node, messageId: "factory" });
    };
    const check = (node: ESTree.ArrowFunctionExpression | ESTree.Function) => {
      // Native family is the supported memoised owner of keyed definitions.
      // Ordinary functions, including callbacks passed to unknown helpers, are
      // not an alternative cache or configuration injection boundary.
      if (
        node.parent.type === "CallExpression" &&
        operation(context, node.parent.callee, module, "family")
      )
        return;
      // Native optimisticFn accepts an Atom-producing callback at options.fn.
      if (
        node.parent.type === "Property" &&
        Option.contains(propertyName(node.parent.key), "fn") &&
        node.parent.parent.type === "ObjectExpression" &&
        node.parent.parent.parent.type === "CallExpression" &&
        operation(context, node.parent.parent.parent.callee, module, "optimisticFn")
      )
        return;
      const typed = Option.fromNullishOr(node.returnType).pipe(
        Option.exists((annotation) => hasType(context, annotation.typeAnnotation, atomTypes)),
      );
      const returns = Option.fromNullishOr(node.body).pipe(
        Option.exists((body) =>
          body.type === "BlockStatement"
            ? returnsAtom(context, body)
            : atomExpression(context, body),
        ),
      );
      if (typed || returns) context.report({ node, messageId: "factory" });
    };
    return {
      "ArrowFunctionExpression:exit": check,
      "FunctionExpression:exit": check,
      "FunctionDeclaration:exit": check,
      TSFunctionType: checkSignature,
      TSMethodSignature: checkSignature,
      TSCallSignatureDeclaration: checkSignature,
    };
  },
});
