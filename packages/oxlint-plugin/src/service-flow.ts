import type { Context, ESTree } from "@oxlint/plugins";
import { Array, Option, Predicate } from "effect";
import { constant, operation, referenceOf, valueOf } from "./native-reference.js";
import { childNodes, propertyName, variableInScope } from "./syntax.js";

export interface Service {
  readonly name: string;
  readonly module: Option.Option<string>;
  readonly declaration: Option.Option<ESTree.Class>;
}

const serviceClass = (context: Context, node: ESTree.Class): boolean => {
  const containsService = (value: ESTree.Node): boolean =>
    (value.type === "CallExpression" &&
      operation(context, value.callee, "effect/Context", "Service")) ||
    Array.some(childNodes(context, value), containsService);
  return Option.fromNullishOr(node.superClass).pipe(Option.exists(containsService));
};

// Imports and immutable aliases retain identity; a shadowed name cannot borrow it.
export const serviceOf = (
  context: Context,
  node: ESTree.Node,
  visited: readonly ESTree.Node[] = [],
): Option.Option<Service> => {
  if (Array.contains(visited, node)) return Option.none();
  const next = [...visited, node];
  const imported = referenceOf(context, node).pipe(
    Option.filter(
      (reference) => !/^(?:(?:effect|alchemy)(?:\/|$)|@alchemy\.run\/)/u.test(reference.module),
    ),
    Option.flatMap((reference) =>
      reference.name.pipe(
        Option.filter((name) => /^[A-Z]/u.test(name)),
        Option.map((name) => ({
          name,
          module: Option.some(reference.module),
          declaration: Option.none<ESTree.Class>(),
        })),
      ),
    ),
  );
  if (Option.isSome(imported)) return imported;
  if (node.type !== "Identifier") return Option.none();
  return variableInScope(context.sourceCode.getScope(node), node.name).pipe(
    Option.flatMap((variable) =>
      Array.head(variable.defs).pipe(
        Option.flatMap((definition) => {
          if (definition.node.type === "ClassDeclaration" && serviceClass(context, definition.node))
            return Option.some({
              name: node.name,
              module: Option.none<string>(),
              declaration: Option.some(definition.node),
            });
          return constant(variable).pipe(
            Option.flatMap((declaration) => Option.fromNullishOr(declaration.init)),
            Option.flatMap((value) => serviceOf(context, value, next)),
          );
        }),
      ),
    ),
  );
};

export const sameService = (left: Service, right: Service): boolean =>
  left.name === right.name &&
  (Option.isSome(left.declaration) && Option.isSome(right.declaration)
    ? left.declaration.value === right.declaration.value
    : Option.isSome(left.module) &&
      Option.isSome(right.module) &&
      left.module.value === right.module.value);

export const serviceTypeOf = (
  context: Context,
  type: ESTree.TSType,
  visited: readonly ESTree.Node[] = [],
): Option.Option<Service> => {
  if (Array.contains(visited, type)) return Option.none();
  const next = [...visited, type];
  if (type.type === "TSTypeReference" && type.typeName.type === "Identifier") {
    const name = type.typeName;
    return variableInScope(context.sourceCode.getScope(name), name.name).pipe(
      Option.flatMap((variable) => Array.head(variable.defs)),
      Option.flatMap((definition) =>
        definition.node.type === "TSTypeAliasDeclaration"
          ? serviceTypeOf(context, definition.node.typeAnnotation, next)
          : Option.none(),
      ),
    );
  }
  if (
    type.type !== "TSIndexedAccessType" ||
    type.indexType.type !== "TSLiteralType" ||
    type.indexType.literal.type !== "Literal" ||
    type.indexType.literal.value !== "Service"
  )
    return Option.none();
  const target =
    type.objectType.type === "TSTypeReference"
      ? type.objectType.typeName
      : type.objectType.type === "TSTypeQuery"
        ? type.objectType.exprName
        : undefined;
  if (!target) return Option.none();
  const service = serviceOf(context, target);
  if (Option.isSome(service) || target.type !== "Identifier") return service;
  // A type-only service import is meaningful here, without treating it as a
  // runtime constructor or native Effect function elsewhere.
  return variableInScope(context.sourceCode.getScope(target), target.name).pipe(
    Option.flatMap((variable) => Array.head(variable.defs)),
    Option.flatMap((definition) => {
      if (
        definition.type !== "ImportBinding" ||
        definition.node.type !== "ImportSpecifier" ||
        definition.parent?.type !== "ImportDeclaration"
      )
        return Option.none();
      const module = definition.parent.source.value;
      return propertyName(definition.node.imported).pipe(
        Option.map((name) => ({
          name,
          module: Option.some(module),
          declaration: Option.none<ESTree.Class>(),
        })),
      );
    }),
  );
};

export const contractFields = (
  context: Context,
  service: Service,
): readonly ESTree.TSSignature[] => {
  const fields = (node: ESTree.Node): readonly ESTree.TSSignature[] => {
    if (
      node.type === "CallExpression" &&
      operation(context, node.callee, "effect/Context", "Service")
    )
      return Option.fromNullishOr(node.typeArguments).pipe(
        Option.flatMap((arguments_) => Array.get(arguments_.params, 1)),
        Option.filter((type) => type.type === "TSTypeLiteral"),
        Option.map((type) => (type.type === "TSTypeLiteral" ? type.members : [])),
        Option.getOrElse(() => []),
      );
    return Array.flatMap(childNodes(context, node), fields);
  };
  return service.declaration.pipe(
    Option.map(fields),
    Option.getOrElse(() => []),
  );
};

export const returned = (context: Context, node: ESTree.Node): readonly ESTree.Node[] => {
  if (node.type === "ReturnStatement") return Option.toArray(Option.fromNullishOr(node.argument));
  if (
    node.type === "ArrowFunctionExpression" ||
    node.type === "FunctionExpression" ||
    node.type === "FunctionDeclaration"
  )
    return [];
  return Array.flatMap(childNodes(context, node), (child) => returned(context, child));
};

// Resolve only visible native constructors and immutable values, never read files.
export const recordOf = (
  context: Context,
  node: ESTree.Node,
  visited: readonly ESTree.Node[] = [],
): Option.Option<ESTree.ObjectExpression> => {
  if (Array.contains(visited, node)) return Option.none();
  const next = [...visited, node];
  return valueOf(context, node).pipe(
    Option.flatMap((value) => {
      if (value.type === "ObjectExpression") return Option.some(value);
      if (value.type === "YieldExpression" && value.argument)
        return recordOf(context, value.argument, next);
      if (value.type !== "CallExpression") return Option.none();
      if (
        value.callee.type === "MemberExpression" &&
        Option.contains(propertyName(value.callee.property), "pipe") &&
        Array.every(
          value.arguments,
          (argument) =>
            argument.type === "CallExpression" &&
            Array.some(["provide", "provideService", "scoped", "withSpan"], (name) =>
              operation(context, argument.callee, "effect/Effect", name),
            ),
        )
      )
        return recordOf(context, value.callee.object, next);
      if (
        (value.callee.type === "MemberExpression" &&
          Option.contains(propertyName(value.callee.property), "of") &&
          Option.isSome(serviceOf(context, value.callee.object))) ||
        operation(context, value.callee, "effect/Effect", "succeed")
      )
        return Array.head(value.arguments).pipe(
          Option.flatMap((argument) => recordOf(context, argument, next)),
        );
      const gen = operation(context, value.callee, "effect/Effect", "gen");
      const map =
        operation(context, value.callee, "effect/Effect", "map") ||
        operation(context, value.callee, "effect/Effect", "flatMap");
      if (!gen && !map) return Option.none();
      return Array.get(value.arguments, gen ? 0 : 1).pipe(
        Option.flatMap((argument) => valueOf(context, argument)),
        Option.filter(
          (callback) =>
            callback.type === "FunctionExpression" || callback.type === "ArrowFunctionExpression",
        ),
        Option.flatMap((callback) =>
          callback.type === "FunctionExpression" || callback.type === "ArrowFunctionExpression"
            ? Option.fromNullishOr(callback.body)
            : Option.none(),
        ),
        Option.flatMap((body) => {
          const values = body.type === "BlockStatement" ? returned(context, body) : [body];
          return values.length === 1 ? Array.head(values) : Option.none();
        }),
        Option.flatMap((result) => recordOf(context, result, next)),
      );
    }),
  );
};

export const borrowedService = (context: Context, node: ESTree.Node): Option.Option<Service> =>
  valueOf(context, node).pipe(
    Option.flatMap((value) =>
      value.type === "YieldExpression" && value.argument
        ? serviceOf(context, value.argument)
        : Option.none(),
    ),
  );

export const recordsOf = (
  context: Context,
  node: ESTree.Node,
  visited: readonly ESTree.Node[] = [],
): readonly ESTree.ObjectExpression[] => {
  if (Array.contains(visited, node)) return [];
  const next = [...visited, node];
  const value = valueOf(context, node);
  if (Option.isNone(value) || value.value.type !== "CallExpression")
    return Option.toArray(recordOf(context, node));
  const call = value.value;
  const gen = operation(context, call.callee, "effect/Effect", "gen");
  const map =
    operation(context, call.callee, "effect/Effect", "map") ||
    operation(context, call.callee, "effect/Effect", "flatMap");
  if (!gen && !map) return Option.toArray(recordOf(context, node));
  const callback = Array.get(call.arguments, gen ? 0 : 1).pipe(
    Option.flatMap((argument) => valueOf(context, argument)),
  );
  if (
    Option.isNone(callback) ||
    (callback.value.type !== "FunctionExpression" &&
      callback.value.type !== "ArrowFunctionExpression") ||
    !callback.value.body
  )
    return [];
  const body = callback.value.body;
  return Array.flatMap(body.type === "BlockStatement" ? returned(context, body) : [body], (value) =>
    recordsOf(context, value, next),
  );
};

export const borrowedOperation = (
  context: Context,
  node: ESTree.Node,
  visited: readonly ESTree.Node[] = [],
): boolean => {
  if (Array.contains(visited, node)) return false;
  const next = [...visited, node];
  if (node.type === "Identifier") {
    return variableInScope(context.sourceCode.getScope(node), node.name).pipe(
      Option.flatMap(constant),
      Option.exists((declaration) => {
        if (!declaration.init) return false;
        if (declaration.id.type === "Identifier")
          return borrowedOperation(context, declaration.init, next);
        return (
          declaration.id.type === "ObjectPattern" &&
          Option.isSome(borrowedService(context, declaration.init)) &&
          Array.some(
            declaration.id.properties,
            (property) =>
              property.type === "Property" &&
              !property.computed &&
              property.value.type === "Identifier" &&
              property.value.name === node.name,
          )
        );
      }),
    );
  }
  return valueOf(context, node).pipe(
    Option.exists((value) => {
      if (value.type !== "MemberExpression") return false;
      if (value.computed && value.property.type !== "Literal") return false;
      return (
        Option.isSome(borrowedService(context, value.object)) ||
        borrowedOperation(context, value.object, next)
      );
    }),
  );
};

export const operationValue = (
  context: Context,
  node: ESTree.Node,
  visited: readonly ESTree.Node[] = [],
): Option.Option<ESTree.Node> => {
  if (Array.contains(visited, node)) return Option.none();
  const next = [...visited, node];
  return valueOf(context, node).pipe(
    Option.flatMap((value) => {
      if (value.type !== "MemberExpression") return Option.some(value);
      return Option.all([recordOf(context, value.object), propertyName(value.property)]).pipe(
        Option.flatMap(([object, key]) =>
          Array.findLast(
            object.properties,
            (property) =>
              property.type === "Property" && Option.contains(propertyName(property.key), key),
          ),
        ),
        Option.flatMap((property) =>
          property.type === "Property"
            ? operationValue(context, property.value, next)
            : Option.none(),
        ),
      );
    }),
  );
};

export const tracedOperation = (context: Context, node: ESTree.Node): boolean =>
  operationValue(context, node).pipe(
    Option.exists(
      (value) =>
        value.type === "CallExpression" &&
        ((value.callee.type === "CallExpression" &&
          operation(context, value.callee.callee, "effect/Effect", "fn") &&
          Array.head(value.callee.arguments).pipe(
            Option.flatMap((argument) => valueOf(context, argument)),
            Option.exists((name) => name.type === "Literal" && Predicate.isString(name.value)),
          )) ||
          (value.callee.type === "MemberExpression" &&
            Option.contains(propertyName(value.callee.property), "pipe") &&
            Array.some(
              value.arguments,
              (argument) =>
                argument.type === "CallExpression" &&
                operation(context, argument.callee, "effect/Effect", "withSpan"),
            ))),
    ),
  );
