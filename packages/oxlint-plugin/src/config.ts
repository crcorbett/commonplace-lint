import { defineRule } from "@oxlint/plugins";
import type { Context, ESTree, Variable } from "@oxlint/plugins";
import { Array, Option, Predicate, Record, Schema } from "effect";
import { childNodes, propertyName, variableInScope } from "./syntax.js";

const RuleId = Schema.String.check(Schema.isPattern(/^\S+$/u));
const Options = Schema.Struct({
  pairs: Schema.NonEmptyArray(Schema.Struct({ owner: RuleId, redundant: RuleId })),
});
type ObjectProperty = Extract<ESTree.ObjectExpression["properties"][number], { type: "Property" }>;

// Resolve only a single-use const. Another read could expose the object to a
// mutation or an opaque function before the configuration is consumed.
const constantValue = (variable: Variable, reference: ESTree.Node): Option.Option<ESTree.Node> =>
  Array.head(variable.defs).pipe(
    Option.filter(() => variable.defs.length === 1),
    Option.filter(() =>
      Array.every(
        variable.references,
        (entry) => (entry.init && entry.isWrite()) || entry.identifier === reference,
      ),
    ),
    Option.flatMap((definition) => {
      if (
        definition.node.type === "VariableDeclarator" &&
        definition.node.id.type === "Identifier" &&
        definition.parent?.type === "VariableDeclaration" &&
        definition.parent.kind === "const"
      ) {
        return Option.fromNullishOr(definition.node.init);
      }
      return Option.none();
    }),
  );

const staticValue = (
  context: Context,
  node: ESTree.Node,
  visited: readonly ESTree.Node[] = [],
): Option.Option<ESTree.Node> => {
  if (Array.some(visited, (previous) => previous === node)) return Option.none();
  const next = [...visited, node];
  if (
    node.type === "TSAsExpression" ||
    node.type === "TSSatisfiesExpression" ||
    node.type === "TSNonNullExpression"
  ) {
    return staticValue(context, node.expression, next);
  }
  if (node.type === "Identifier") {
    return variableInScope(context.sourceCode.getScope(node), node.name).pipe(
      Option.flatMap((variable) =>
        Array.some(variable.defs, (definition) => definition.type === "ImportBinding")
          ? Option.some(node)
          : constantValue(variable, node).pipe(
              Option.flatMap((value) => staticValue(context, value, next)),
            ),
      ),
    );
  }
  return Option.some(node);
};

// Spreads and dynamic keys invalidate earlier facts. Later explicit properties
// regain certainty; spread contents and other configuration scopes stay opaque.
const staticProperties = (
  context: Context,
  node: ESTree.Node,
): Option.Option<Readonly<Record<string, ObjectProperty>>> =>
  staticValue(context, node).pipe(
    Option.filter((value) => value.type === "ObjectExpression"),
    Option.flatMap((value) => {
      if (value.type !== "ObjectExpression") return Option.none();
      const empty: Readonly<Record<string, ObjectProperty>> = {};
      return Option.some(
        Array.reduce(value.properties, empty, (known, entry) => {
          if (entry.type !== "Property") return empty;
          const key = entry.computed
            ? entry.key.type === "Literal" && Predicate.isString(entry.key.value)
              ? Option.some(entry.key.value)
              : Option.none<string>()
            : propertyName(entry.key);
          return Option.match(key, {
            onNone: () => empty,
            onSome: (name) => Record.set(known, name, entry),
          });
        }),
      );
    }),
  );

const importedConfig = (context: Context, node: ESTree.Node, namespace: boolean): boolean => {
  if (node.type !== "Identifier") return false;
  return variableInScope(context.sourceCode.getScope(node), node.name).pipe(
    Option.flatMap((variable) => Array.head(variable.defs)),
    Option.exists((definition) => {
      if (
        definition.type !== "ImportBinding" ||
        definition.parent?.type !== "ImportDeclaration" ||
        definition.parent.source.value !== "oxlint" ||
        definition.parent.importKind === "type"
      ) {
        return false;
      }
      if (namespace) return definition.node.type === "ImportNamespaceSpecifier";
      return (
        definition.node.type === "ImportSpecifier" &&
        definition.node.importKind !== "type" &&
        Option.contains(propertyName(definition.node.imported), "defineConfig")
      );
    }),
  );
};

const configFunction = (context: Context, node: ESTree.Node): boolean => {
  if (importedConfig(context, node, false)) return true;
  return staticValue(context, node).pipe(
    Option.exists((value) => {
      if (importedConfig(context, value, false)) return true;
      if (value.type !== "MemberExpression") return false;
      return (
        (!value.computed || value.property.type === "Literal") &&
        Option.contains(propertyName(value.property), "defineConfig") &&
        importedConfig(context, value.object, true)
      );
    }),
  );
};

const descendants = (context: Context, node: ESTree.Node): readonly ESTree.Node[] => [
  node,
  ...Array.flatMap(childNodes(context, node), (child) => descendants(context, child)),
];

const enabledSeverity = (node: ESTree.Node): boolean =>
  node.type === "Literal" &&
  (node.value === "error" ||
    node.value === "deny" ||
    node.value === "warn" ||
    node.value === 1 ||
    node.value === 2);

const enabled = (context: Context, node: ESTree.Node): boolean =>
  staticValue(context, node).pipe(
    Option.exists((value) => {
      if (value.type === "Literal") {
        return enabledSeverity(value);
      }
      if (value.type === "ArrayExpression") {
        return Array.head(value.elements).pipe(
          Option.flatMap(Option.fromNullishOr),
          Option.flatMap((first) => staticValue(context, first)),
          Option.exists(enabledSeverity),
        );
      }
      return false;
    }),
  );

export const noRedundantRuleRegistrations = defineRule({
  meta: {
    type: "problem",
    docs: {
      description:
        "Reject explicitly configured redundant lint registrations when their owner is also enabled.",
    },
    schema: [
      {
        type: "object",
        properties: {
          pairs: {
            type: "array",
            minItems: 1,
            items: {
              type: "object",
              properties: {
                owner: { type: "string", minLength: 1 },
                redundant: { type: "string", minLength: 1 },
              },
              required: ["owner", "redundant"],
              additionalProperties: false,
            },
          },
        },
        required: ["pairs"],
        additionalProperties: false,
      },
    ],
    messages: {
      options:
        "Configure exact owner/redundant rule pairs whose overlap this consumer has verified.",
      redundant:
        "{{redundant}} is redundant while {{owner}} is enabled in this rules object. Keep the verified owner.",
    },
  },
  create(context) {
    const options = Array.head(context.options).pipe(
      Option.flatMap(Schema.decodeUnknownOption(Options)),
    );
    const canonicalFile = /(?:^|\/)oxlint\.config\.[cm]?[jt]s$/u.test(
      context.filename.replaceAll("\\", "/"),
    );
    const inspect = (node: ESTree.Node) => {
      Option.match(Option.all([options, staticProperties(context, node)]), {
        onNone: () => {},
        onSome: ([configuration, properties]) => {
          Array.forEach(
            Array.dedupeWith(
              configuration.pairs,
              (left, right) => left.owner === right.owner && left.redundant === right.redundant,
            ),
            ({ owner, redundant }) => {
              if (owner === redundant) return;
              const pair = Option.all([
                Record.get(properties, owner),
                Record.get(properties, redundant),
              ]);
              Option.match(pair, {
                onNone: () => {},
                onSome: ([ownerProperty, redundantProperty]) => {
                  if (
                    enabled(context, ownerProperty.value) &&
                    enabled(context, redundantProperty.value)
                  ) {
                    context.report({
                      node: redundantProperty,
                      messageId: "redundant",
                      data: { owner, redundant },
                    });
                  }
                },
              });
            },
          );
        },
      });
    };
    const inspectConfiguration = (node: ESTree.Node) => {
      Option.match(staticProperties(context, node), {
        onNone: () => {},
        onSome: (properties) => {
          Option.match(Record.get(properties, "rules"), {
            onNone: () => {},
            onSome: (rules) => inspect(rules.value),
          });
          Record.get(properties, "overrides").pipe(
            Option.flatMap((overrides) => staticValue(context, overrides.value)),
            Option.filter((value) => value.type === "ArrayExpression"),
            Option.map((value) => {
              if (value.type === "ArrayExpression")
                Array.forEach(value.elements, (entry) => {
                  if (entry) inspectConfiguration(entry);
                });
            }),
          );
        },
      });
    };
    return {
      "Program:exit"(program) {
        if (Option.isNone(options)) {
          context.report({ node: program, messageId: "options" });
          return;
        }
        const roots = Array.flatMap(
          descendants(context, program),
          (node): readonly ESTree.Node[] => {
            if (node.type === "CallExpression" && configFunction(context, node.callee)) {
              return Option.toArray(Array.head(node.arguments));
            }
            if (canonicalFile && node.type === "ExportDefaultDeclaration")
              return [node.declaration];
            return [];
          },
        );
        Array.forEach(
          Array.dedupeWith(roots, (left, right) => left === right),
          inspectConfiguration,
        );
      },
    };
  },
});
