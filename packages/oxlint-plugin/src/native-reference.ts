import type { Context, ESTree, Variable } from "@oxlint/plugins";
import * as Array from "effect/Array";
import * as Option from "effect/Option";
import { propertyName, variableInScope } from "./syntax.js";

interface Reference {
  readonly module: string;
  readonly name: Option.Option<string>;
}
export const constant = (variable: Variable): Option.Option<ESTree.VariableDeclarator> =>
  Array.head(variable.defs).pipe(
    Option.filter(() => variable.defs.length === 1),
    Option.filter(() =>
      Array.every<Variable["references"][number]>(
        (reference) => !reference.isWrite() || reference.init,
      )(variable.references),
    ),
    Option.flatMap((definition) =>
      definition.node.type === "VariableDeclarator" &&
      definition.parent?.type === "VariableDeclaration" &&
      definition.parent.kind === "const"
        ? Option.some(definition.node)
        : Option.none(),
    ),
  );

const member = (reference: Reference, name: string): Option.Option<Reference> => {
  if (Option.isSome(reference.name)) return Option.none();
  if (reference.module === "@effect/atom-react" && name === "Atom") {
    return Option.some({ module: "effect/reactivity/Atom", name: Option.none() });
  }
  return reference.module === "alchemy" ||
    reference.module === "effect" ||
    Array.contains(
      ["effect/reactivity", "effect/http", "effect/http-api", "effect/rpc", "effect/unstable/http"],
      reference.module,
    ) ||
    (reference.module === "effect/process" &&
      (name === "ChildProcess" || name === "ChildProcessSpawner"))
    ? Option.some({ module: `${reference.module}/${name}`, name: Option.none() })
    : Option.some({ ...reference, name: Option.some(name) });
};

// Only real imports and immutable local aliases count. The nearest declaration
// prevents a shadowed parameter from borrowing an outer import's identity.
export const referenceOf = (
  context: Context,
  node: ESTree.Node,
  visited: readonly ESTree.Node[] = [],
): Option.Option<Reference> => {
  if (Array.some(visited, (previous) => previous === node)) return Option.none();
  const next = [...visited, node];
  if (
    node.type === "TSAsExpression" ||
    node.type === "TSSatisfiesExpression" ||
    node.type === "TSInstantiationExpression" ||
    node.type === "ChainExpression"
  ) {
    return referenceOf(context, node.expression, next);
  }
  if (node.type === "MemberExpression") {
    const name = node.computed
      ? node.property.type === "Literal"
        ? propertyName(node.property)
        : Option.none()
      : propertyName(node.property);
    return Option.all([referenceOf(context, node.object, next), name]).pipe(
      Option.flatMap(([reference, key]) => member(reference, key)),
    );
  }
  if (node.type !== "Identifier") return Option.none();
  return variableInScope(context.sourceCode.getScope(node), node.name).pipe(
    Option.flatMap((variable) =>
      Array.head(variable.defs).pipe(
        Option.flatMap((definition) => {
          if (
            definition.type === "ImportBinding" &&
            definition.parent?.type === "ImportDeclaration" &&
            definition.parent.importKind !== "type"
          ) {
            const module = definition.parent.source.value;
            const reference = { module, name: Option.none<string>() };
            if (definition.node.type === "ImportNamespaceSpecifier") return Option.some(reference);
            if (
              definition.node.type === "ImportSpecifier" &&
              definition.node.importKind !== "type"
            ) {
              return propertyName(definition.node.imported).pipe(
                Option.flatMap((name) => member(reference, name)),
              );
            }
            return Option.none();
          }
          return constant(variable).pipe(
            Option.flatMap((declaration) =>
              Option.fromNullishOr(declaration.init).pipe(
                Option.flatMap((initialiser) => {
                  if (declaration.id.type === "Identifier") {
                    return referenceOf(context, initialiser, next);
                  }
                  if (declaration.id.type !== "ObjectPattern") return Option.none();
                  return Array.findFirst<ESTree.ObjectPattern["properties"][number]>(
                    (property) =>
                      property.type === "Property" &&
                      property.value.type === "Identifier" &&
                      property.value.name === node.name &&
                      !property.computed,
                  )(declaration.id.properties).pipe(
                    Option.flatMap((property) =>
                      property.type === "Property"
                        ? Option.all([
                            referenceOf(context, initialiser, next),
                            propertyName(property.key),
                          ]).pipe(Option.flatMap(([reference, key]) => member(reference, key)))
                        : Option.none(),
                    ),
                  );
                }),
              ),
            ),
          );
        }),
      ),
    ),
  );
};

export const valueOf = (
  context: Context,
  node: ESTree.Node,
  visited: readonly ESTree.Node[] = [],
): Option.Option<ESTree.Node> => {
  if (Array.some(visited, (previous) => previous === node)) return Option.none();
  const next = [...visited, node];
  if (node.type === "TSAsExpression" || node.type === "TSSatisfiesExpression") {
    return valueOf(context, node.expression, next);
  }
  if (node.type !== "Identifier") return Option.some(node);
  return variableInScope(context.sourceCode.getScope(node), node.name).pipe(
    Option.flatMap(constant),
    Option.filter((declaration) => declaration.id.type === "Identifier"),
    Option.flatMap((declaration) => Option.fromNullishOr(declaration.init)),
    Option.flatMap((initialiser) => valueOf(context, initialiser, next)),
  );
};

export const operation = (context: Context, node: ESTree.Node, module: string, name: string) =>
  referenceOf(context, node).pipe(
    Option.exists(
      (reference) =>
        (reference.module === module && Option.contains(reference.name, name)) ||
        (reference.module === `${module}/${name}` && Option.isNone(reference.name)),
    ),
  );
