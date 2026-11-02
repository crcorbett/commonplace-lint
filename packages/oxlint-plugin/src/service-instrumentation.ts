import { defineRule } from "@oxlint/plugins";
import type { Context, ESTree } from "@oxlint/plugins";
import { Array, Chunk, Option, Schema } from "effect";
import { operation, referenceOf, valueOf } from "./native-reference.js";
import { propertyName, variableInScope } from "./syntax.js";
import {
  borrowedOperation,
  borrowedService,
  contractFields,
  operationValue,
  recordOf,
  recordsOf,
  returned,
  serviceOf,
  serviceTypeOf,
  tracedOperation,
  type Service,
} from "./service-flow.js";

const Options = Schema.Struct({
  serviceNames: Schema.optionalKey(Schema.NonEmptyArray(Schema.String)),
  operationAdapters: Schema.optionalKey(
    Schema.Array(
      Schema.Struct({
        module: Schema.optionalKey(Schema.NonEmptyString),
        file: Schema.NonEmptyString.check(
          Schema.isPattern(/^(?!\/)(?!.*(?:\*|\\|(?:^|\/)\.\.?\/)).+\.tsx?$/u),
        ),
        exports: Schema.NonEmptyArray(Schema.NonEmptyString),
        operation: Schema.NonEmptyString,
      }),
    ),
  ),
});
const adapted = (
  context: Context,
  node: ESTree.Node,
  name: string,
  adapters: NonNullable<typeof Options.Type.operationAdapters>,
  reused = false,
): boolean => {
  const value = valueOf(context, node).pipe(
    Option.flatMap((value) => {
      if (value.type === "YieldExpression" && value.argument)
        return valueOf(context, value.argument);
      if (value.type === "ArrowFunctionExpression" && value.body.type !== "BlockStatement")
        return valueOf(context, value.body);
      return Option.some(value);
    }),
  );
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
          (reused || adapter.operation === name) &&
          Option.exists(reference.name, (export_) => Array.contains(adapter.exports, export_)) &&
          (reference.module === adapter.module ||
            source(relative) === source(`${context.cwd}/${adapter.file}`))
        );
      }),
    ),
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
              Array.contains(
                [
                  "effect/Option",
                  "effect/Stream",
                  "effect/Schema",
                  "effect/Ref",
                  "effect/Queue",
                  "effect/PubSub",
                  "effect/Semaphore",
                  "effect/SubscriptionRef",
                  "effect/HashMap",
                  "effect/HashSet",
                ],
                module,
              ),
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
    const values = returned(context, node.body);
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
              required: ["file", "exports", "operation"],
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
    const check = (
      object: ESTree.ObjectExpression,
      prefix: string,
      members: readonly ESTree.TSSignature[],
      reused = false,
      layer = false,
      visited: readonly ESTree.Node[] = [],
    ): void => {
      if (
        Array.contains(visited, object) ||
        (visited.length > 0 && object.properties.length === 0)
      ) {
        context.report({ node: object, messageId: "unsupportedOperation" });
        return;
      }
      Array.forEach(object.properties, (property) => {
        if (property.type === "SpreadElement") {
          if (Option.isSome(borrowedService(context, property.argument))) return;
          const source = recordOf(context, property.argument);
          if (Option.isSome(source))
            check(source.value, prefix, [], true, layer, [...visited, object]);
          else context.report({ node: property, messageId: "unsupportedOperation" });
          return;
        }
        const key =
          property.computed && property.key.type !== "Literal"
            ? Option.none<string>()
            : propertyName(property.key);
        Option.match(key, {
          onNone: () => context.report({ node: property, messageId: "unsupportedOperation" }),
          onSome: (member) => {
            if (dataMember(context, members, member) || streamValue(context, property.value))
              return;
            const name = `${prefix}.${member}`;
            const value = valueOf(context, property.value);
            if (Option.isSome(value) && value.value.type === "ObjectExpression") {
              const nested = Array.findFirst(
                members,
                (field) =>
                  field.type === "TSPropertySignature" &&
                  Option.contains(propertyName(field.key), member),
              ).pipe(
                Option.flatMap((field) =>
                  field.type === "TSPropertySignature"
                    ? Option.fromNullishOr(field.typeAnnotation?.typeAnnotation)
                    : Option.none(),
                ),
                Option.filter((type) => type.type === "TSTypeLiteral"),
                Option.map((type) => (type.type === "TSTypeLiteral" ? type.members : [])),
                Option.getOrElse(() => []),
              );
              check(value.value, name, nested, reused, layer, [...visited, object]);
              return;
            }
            if (
              borrowedOperation(context, property.value) ||
              (Option.isSome(value) &&
                value.value.type === "MemberExpression" &&
                tracedOperation(context, property.value)) ||
              (reused && tracedOperation(context, property.value))
            )
              return;
            const signature = Array.findFirst(
              members,
              (field) =>
                (field.type === "TSPropertySignature" || field.type === "TSMethodSignature") &&
                Option.contains(propertyName(field.key), member),
            );
            const declaredOperation = Option.exists(
              signature,
              (field) =>
                field.type === "TSMethodSignature" ||
                (field.type === "TSPropertySignature" &&
                  field.typeAnnotation?.typeAnnotation.type === "TSFunctionType"),
            );
            // Bare Layers also construct data services. Only a function, native
            // Effect expression or declared operation is positive evidence there.
            const resolved = operationValue(context, property.value);
            const operational = Option.exists(
              resolved,
              (operation_) =>
                operation_.type === "ArrowFunctionExpression" ||
                operation_.type === "FunctionExpression" ||
                tracedOperation(context, property.value) ||
                referenceOf(context, operation_).pipe(
                  Option.exists((reference) => reference.module === "effect/Effect"),
                ) ||
                (operation_.type === "CallExpression" &&
                  referenceOf(context, operation_.callee).pipe(
                    Option.exists((reference) => reference.module === "effect/Effect"),
                  )),
            );
            if (layer && !declaredOperation && !operational) return;
            if (
              !instrumented(context, property.value, name) &&
              !adapted(
                context,
                property.value,
                name,
                options.operationAdapters ?? [],
                reused ||
                  layer ||
                  Option.exists(resolved, (value) => value.type === "YieldExpression"),
              )
            )
              context.report({
                node: property,
                messageId: "missingInstrumentation",
                data: { operation: name },
              });
          },
        });
      });
    };
    const selectedService = (target: ESTree.Node): Option.Option<Service> => {
      const selected = options.serviceNames;
      return selected
        ? target.type === "Identifier" && Array.contains(selected, target.name)
          ? Option.some({
              name: target.name,
              module: Option.none<string>(),
              declaration: Option.none<ESTree.Class>(),
            })
          : Option.none()
        : serviceOf(context, target);
    };
    const constructorObject = (object: ESTree.ObjectExpression): boolean => {
      const parent = object.parent;
      return (
        parent?.type === "CallExpression" &&
        parent.callee.type === "MemberExpression" &&
        Option.contains(propertyName(parent.callee.property), "of")
      );
    };
    const typedObject = (object: ESTree.ObjectExpression): boolean =>
      object.parent?.type === "TSSatisfiesExpression" &&
      Option.isSome(serviceTypeOf(context, object.parent.typeAnnotation));
    return {
      TSSatisfiesExpression(node) {
        const owner = serviceTypeOf(context, node.typeAnnotation).pipe(
          Option.filter(
            (service) =>
              !options.serviceNames || Array.contains(options.serviceNames, service.name),
          ),
        );
        const object = recordOf(context, node.expression);
        if (Option.isSome(owner) && Option.isSome(object))
          check(object.value, owner.value.name, contractFields(context, owner.value));
      },
      CallExpression(node) {
        const mock = operation(context, node.callee, "effect/Layer", "mock");
        const effect = operation(context, node.callee, "effect/Layer", "effect");
        const succeed = operation(context, node.callee, "effect/Layer", "succeed");
        const constructor =
          mock || effect || succeed
            ? Array.head(node.arguments)
            : node.callee.type === "MemberExpression" &&
                Option.contains(propertyName(node.callee.property), "of")
              ? Option.some(node.callee.object)
              : Option.none<ESTree.Node>();
        if (Option.isNone(constructor)) return;
        const owner = selectedService(constructor.value);
        if (Option.isNone(owner)) return;
        const argument = Array.get(node.arguments, mock || effect || succeed ? 1 : 0);
        if (effect && Option.isSome(argument)) {
          Array.forEach(recordsOf(context, argument.value), (object) => {
            if (!constructorObject(object) && !typedObject(object))
              check(object, owner.value.name, contractFields(context, owner.value), false, true);
          });
          return;
        }
        const object = argument.pipe(
          Option.flatMap((value) =>
            effect || succeed ? recordOf(context, value) : valueOf(context, value),
          ),
        );
        if (Option.isNone(object) || object.value.type !== "ObjectExpression") {
          if (!effect && !succeed) context.report({ node, messageId: "unsupportedOperation" });
          return;
        }
        if ((effect || succeed) && (constructorObject(object.value) || typedObject(object.value)))
          return;
        check(
          object.value,
          owner.value.name,
          contractFields(context, owner.value),
          false,
          effect || succeed,
        );
      },
    };
  },
});
