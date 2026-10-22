import { defineRule } from "@oxlint/plugins";
import type { Context, ESTree } from "@oxlint/plugins";
import { Array, Chunk, Option, Schema } from "effect";
import { constant, operation, referenceOf, valueOf } from "./native-reference.js";
import { childNodes, propertyName, variableInScope } from "./syntax.js";

const Options = Schema.Struct({
  serviceNames: Schema.optionalKey(Schema.NonEmptyArray(Schema.String)),
  operationAdapters: Schema.optionalKey(
    Schema.Array(
      Schema.Struct({
        module: Schema.NonEmptyString,
        file: Schema.NonEmptyString.check(
          Schema.isPattern(/^(?!\/)(?!.*(?:\*|\\|(?:^|\/)\.\.?\/)).+\.tsx?$/u),
        ),
        exports: Schema.NonEmptyArray(Schema.NonEmptyString),
        operation: Schema.NonEmptyString,
      }),
    ),
  ),
});
interface Service {
  readonly name: string;
  readonly declaration: Option.Option<ESTree.Class>;
}

const adapted = (
  context: Context,
  node: ESTree.Node,
  name: string,
  adapters: NonNullable<typeof Options.Type.operationAdapters>,
): boolean => {
  const value = valueOf(context, node);
  if (Option.isNone(value) || value.value.type !== "CallExpression") return false;
  return referenceOf(context, value.value.callee).pipe(
    Option.exists((reference) =>
      Array.some(adapters, (adapter) => {
        const relative = reference.module.startsWith(".")
          ? Chunk.join(
              Array.reduce(
                reference.module.split("/"),
                Chunk.fromIterable(
                  Array.dropRight(context.filename.replaceAll("\\", "/").split("/"), 1),
                ),
                (parts, segment) =>
                  segment === ".."
                    ? Chunk.dropRight(parts, 1)
                    : segment === "."
                      ? parts
                      : Chunk.append(parts, segment),
              ),
              "/",
            )
          : "";
        const source = (path: string) => path.replace(/\.[cm]?[jt]sx?$/u, "");
        return (
          adapter.operation === name &&
          Option.exists(reference.name, (export_) => Array.contains(adapter.exports, export_)) &&
          (reference.module === adapter.module ||
            source(relative) === source(`${context.cwd}/${adapter.file}`))
        );
      }),
    ),
  );
};

const serviceClass = (context: Context, node: ESTree.Class): boolean => {
  const containsService = (value: ESTree.Node): boolean =>
    (value.type === "CallExpression" &&
      operation(context, value.callee, "effect/Context", "Service")) ||
    Array.some(childNodes(context, value), containsService);
  return Option.fromNullishOr(node.superClass).pipe(Option.exists(containsService));
};

// Imported names preserve the contract's canonical name even when locally aliased.
// Local objects and shadowed parameters cannot borrow an imported service name.
const serviceOf = (
  context: Context,
  node: ESTree.Node,
  visited: readonly ESTree.Node[] = [],
): Option.Option<Service> => {
  if (Array.some(visited, (previous) => previous === node)) return Option.none();
  const next = [...visited, node];
  const imported = referenceOf(context, node).pipe(
    Option.filter((reference) => !/^(?:effect|alchemy)(?:\/|$)/u.test(reference.module)),
    Option.flatMap((reference) => reference.name),
    Option.filter((name) => /^[A-Z]/u.test(name)),
    Option.map((name) => ({ name, declaration: Option.none<ESTree.Class>() })),
  );
  if (Option.isSome(imported)) return imported;
  if (node.type !== "Identifier") return Option.none();
  return variableInScope(context.sourceCode.getScope(node), node.name).pipe(
    Option.flatMap((variable) =>
      Array.head(variable.defs).pipe(
        Option.flatMap((definition) => {
          if (
            definition.node.type === "ClassDeclaration" &&
            serviceClass(context, definition.node)
          ) {
            return Option.some({ name: node.name, declaration: Option.some(definition.node) });
          }
          return constant(variable).pipe(
            Option.flatMap((declaration) => Option.fromNullishOr(declaration.init)),
            Option.flatMap((value) => serviceOf(context, value, next)),
          );
        }),
      ),
    ),
  );
};

// Local contracts supply positive evidence for data/Stream members. No property
// name, file suffix or service name is exempted from operation checks.
const contractFields = (context: Context, service: Service): readonly ESTree.TSSignature[] => {
  const fields = (node: ESTree.Node): readonly ESTree.TSSignature[] => {
    if (
      node.type === "CallExpression" &&
      operation(context, node.callee, "effect/Context", "Service")
    ) {
      return Option.fromNullishOr(node.typeArguments).pipe(
        Option.flatMap((arguments_) => Array.get(arguments_.params, 1)),
        Option.filter((type) => type.type === "TSTypeLiteral"),
        Option.map((type) => (type.type === "TSTypeLiteral" ? type.members : [])),
        Option.getOrElse(() => []),
      );
    }
    return Array.flatMap(childNodes(context, node), fields);
  };
  return service.declaration.pipe(
    Option.map(fields),
    Option.getOrElse(() => []),
  );
};

const typeModule = (context: Context, type: ESTree.TSTypeReference): Option.Option<string> => {
  const name = type.typeName;
  const root = name.type === "TSQualifiedName" ? name.left : name;
  if (root.type !== "Identifier") return Option.none();
  return variableInScope(context.sourceCode.getScope(root), root.name).pipe(
    Option.flatMap((variable) => Array.head(variable.defs)),
    Option.flatMap((definition) => {
      if (definition.type !== "ImportBinding" || definition.parent?.type !== "ImportDeclaration")
        return Option.none();
      const source = definition.parent.source.value;
      if (source === "effect" && definition.node.type === "ImportSpecifier") {
        return propertyName(definition.node.imported).pipe(
          Option.map((member) => `effect/${member}`),
        );
      }
      return Option.some(source);
    }),
  );
};

const dataMember = (
  context: Context,
  fields: readonly ESTree.TSSignature[],
  name: string,
): boolean =>
  Array.findFirst(
    fields,
    (field) =>
      field.type === "TSPropertySignature" && Option.contains(propertyName(field.key), name),
  ).pipe(
    Option.flatMap((field) =>
      field.type === "TSPropertySignature"
        ? Option.fromNullishOr(field.typeAnnotation?.typeAnnotation)
        : Option.none(),
    ),
    Option.exists(
      (type) =>
        Array.contains(
          ["TSStringKeyword", "TSNumberKeyword", "TSBooleanKeyword", "TSLiteralType"],
          type.type,
        ) ||
        (type.type === "TSTypeReference" &&
          typeModule(context, type).pipe(
            Option.exists((module) =>
              Array.contains(["effect/Option", "effect/Stream", "effect/Schema"], module),
            ),
          )),
    ),
  );

const streamValue = (context: Context, node: ESTree.Node): boolean =>
  valueOf(context, node).pipe(
    Option.exists((value) => {
      if (value.type === "CallExpression") {
        if (
          value.callee.type === "MemberExpression" &&
          Option.contains(propertyName(value.callee.property), "pipe")
        ) {
          return streamValue(context, value.callee.object);
        }
        return (
          value.callee.type === "MemberExpression" &&
          value.callee.object.type === "Identifier" &&
          operation(context, value.callee.object, "effect", "Stream")
        );
      }
      return (
        value.type === "MemberExpression" && operation(context, value.object, "effect", "Stream")
      );
    }),
  );

const named = (context: Context, node: ESTree.Node, name: string, method: string): boolean =>
  node.type === "CallExpression" &&
  operation(context, node.callee, "effect/Effect", method) &&
  Array.head(node.arguments).pipe(
    Option.exists((argument) => argument.type === "Literal" && argument.value === name),
  );

// A nested unrelated span is insufficient: instrumentation must wrap the value
// or the operation's returned Effect, including every explicit return branch.
const instrumented = (
  context: Context,
  node: ESTree.Node,
  name: string,
  visited: readonly ESTree.Node[] = [],
): boolean => {
  if (Array.some(visited, (previous) => previous === node)) return false;
  const next = [...visited, node];
  if (node.type === "Identifier") {
    return valueOf(context, node).pipe(
      Option.exists((value) => instrumented(context, value, name, next)),
    );
  }
  if (node.type === "ArrowFunctionExpression" || node.type === "FunctionExpression") {
    if (node.body === null) return false;
    if (node.body.type !== "BlockStatement") return instrumented(context, node.body, name, next);
    const returned = (statement: ESTree.Node): readonly ESTree.Node[] => {
      if (statement.type === "ReturnStatement")
        return Option.toArray(Option.fromNullishOr(statement.argument));
      if (
        statement.type === "ArrowFunctionExpression" ||
        statement.type === "FunctionExpression" ||
        statement.type === "FunctionDeclaration"
      )
        return [];
      return Array.flatMap(childNodes(context, statement), returned);
    };
    const values = returned(node.body);
    return (
      values.length > 0 && Array.every(values, (value) => instrumented(context, value, name, next))
    );
  }
  if (node.type !== "CallExpression") return false;
  if (
    node.callee.type === "CallExpression" &&
    (named(context, node.callee, name, "fn") || named(context, node.callee, name, "withSpan"))
  )
    return true;
  return (
    ((node.callee.type === "MemberExpression" &&
      Option.contains(propertyName(node.callee.property), "pipe")) ||
      operation(context, node.callee, "effect/Function", "pipe")) &&
    Array.some(node.arguments, (argument) => named(context, argument, name, "withSpan"))
  );
};

export const requireServiceOperationInstrumentation = defineRule({
  meta: {
    type: "problem",
    schema: [
      {
        type: "object",
        properties: {
          serviceNames: { type: "array", minItems: 1, items: { type: "string", minLength: 1 } },
          operationAdapters: {
            type: "array",
            items: {
              type: "object",
              properties: {
                module: { type: "string", minLength: 1 },
                file: { type: "string", minLength: 1 },
                exports: { type: "array", minItems: 1, items: { type: "string", minLength: 1 } },
                operation: { type: "string", minLength: 1 },
              },
              required: ["module", "file", "exports", "operation"],
              additionalProperties: false,
            },
          },
        },
        additionalProperties: false,
      },
    ],
    docs: {
      description:
        "Require canonical operation spans on native services, including imported aliases and mixed contracts.",
    },
    messages: {
      missingInstrumentation:
        "Instrument {{operation}} with Effect.fn or Effect.withSpan using that exact name.",
      unsupportedOperation:
        "Declare service members as explicit named properties so their operation spans can be checked.",
    },
  },
  create(context) {
    // Oxlint owns this synchronous options boundary. Invalid options stop linting.
    const options = Schema.decodeUnknownSync(Options)(
      Option.getOrElse(Array.head(context.options), () => ({})),
    );
    return {
      CallExpression(node) {
        const mock = operation(context, node.callee, "effect/Layer", "mock");
        const constructor = mock
          ? Array.head(node.arguments)
          : node.callee.type === "MemberExpression" &&
              Option.contains(propertyName(node.callee.property), "of")
            ? Option.some(node.callee.object)
            : Option.none<ESTree.Node>();
        if (Option.isNone(constructor)) return;
        const target = constructor.value;
        const selected = options.serviceNames;
        const explicit = target.type === "Identifier" && selected?.includes(target.name);
        const service = explicit
          ? Option.some({
              name: target.type === "Identifier" ? target.name : "",
              declaration: Option.none<ESTree.Class>(),
            })
          : selected
            ? Option.none<Service>()
            : serviceOf(context, target);
        Option.match(service, {
          onNone: () => {},
          onSome: (owner) => {
            const fields = contractFields(context, owner);
            const argument = Array.get(node.arguments, mock ? 1 : 0).pipe(
              Option.flatMap((value) => valueOf(context, value)),
            );
            if (Option.isNone(argument) || argument.value.type !== "ObjectExpression") {
              context.report({ node, messageId: "unsupportedOperation" });
              return;
            }
            Array.forEach(argument.value.properties, (property) => {
              if (property.type !== "Property") {
                context.report({ node: property, messageId: "unsupportedOperation" });
                return;
              }
              const key =
                property.computed && property.key.type !== "Literal"
                  ? Option.none<string>()
                  : propertyName(property.key);
              Option.match(key, {
                onNone: () => context.report({ node: property, messageId: "unsupportedOperation" }),
                onSome: (member) => {
                  if (dataMember(context, fields, member) || streamValue(context, property.value))
                    return;
                  const name = `${owner.name}.${member}`;
                  if (
                    !instrumented(context, property.value, name) &&
                    !adapted(context, property.value, name, options.operationAdapters ?? [])
                  )
                    context.report({
                      node: property,
                      messageId: "missingInstrumentation",
                      data: { operation: name },
                    });
                },
              });
            });
          },
        });
      },
    };
  },
});
