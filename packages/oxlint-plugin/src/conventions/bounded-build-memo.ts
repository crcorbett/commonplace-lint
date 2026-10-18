import { defineRule } from "@oxlint/plugins";
import type { Context, ESTree } from "@oxlint/plugins";
import * as Array from "effect/Array";
import * as Function from "effect/Function";
import * as Option from "effect/Option";
import * as Predicate from "effect/Predicate";
import * as Schema from "effect/Schema";

import { constant as constantDeclaration } from "../native-reference.js";
import { variableInScope as scopedVariable } from "../syntax.js";
import { propertyName } from "../syntax.js";

const FilePath = Schema.NonEmptyString.check(
  Schema.isPattern(/^(?!\/)(?!.*(?:\*|\\|(?:^|\/)\.\.?\/)).+\.tsx?$/u),
);
const Identifier = Schema.NonEmptyString.check(Schema.isPattern(/^[A-Za-z_$][\w$]*$/u));
const Options = Schema.Struct({
  targets: Schema.NonEmptyArray(Schema.Struct({ file: FilePath, declaration: Identifier })),
});

// Only immutable local syntax is inspectable. Imported values and cyclic aliases
// cannot silently replace the checked memo with an opaque value.
const localValue = (
  context: Context,
  node: ESTree.Node,
  visited: readonly ESTree.Node[] = [],
): Option.Option<ESTree.Node> => {
  if (Array.some<ESTree.Node>((previous) => previous === node)(visited)) {
    return Option.none();
  }
  const next = [...visited, node];
  if (node.type === "TSSatisfiesExpression" || node.type === "TSAsExpression") {
    return localValue(context, node.expression, next);
  }
  if (node.type !== "Identifier") {
    return Option.some(node);
  }
  const scope = context.sourceCode.getScope(node);
  return scopedVariable(scope, node.name).pipe(
    Option.flatMap(constantDeclaration),
    Option.flatMap((declaration) => Option.fromNullishOr(declaration.init)),
    Option.flatMap((initialiser) => localValue(context, initialiser, next)),
  );
};

const field = (object: ESTree.ObjectExpression, name: string) =>
  Array.findFirst<ESTree.ObjectExpression["properties"][number]>(
    (property) =>
      property.type === "Property" &&
      !property.computed &&
      Option.contains(propertyName(property.key), name),
  )(object.properties).pipe(
    Option.filter((property) => property.type === "Property"),
    Option.map((property) => property.value),
  );

const boundedPattern = (pattern: string) => {
  if (
    pattern.length === 0 ||
    /^(?:\/|!)/u.test(pattern) ||
    /[\\{}[\]]/u.test(pattern) ||
    /(?:^|\/)(?:node_modules|\.git|dist)(?:\/|$)/u.test(pattern)
  ) {
    return false;
  }
  if (!pattern.startsWith("../")) {
    return !pattern.includes("/../");
  }
  const external = pattern.replace(/^(?:\.\.\/)+/u, "");
  const segments = external.split("/");
  if (Array.contains("..")(segments)) {
    return false;
  }
  const recursive = Array.findFirstIndex<string>((segment) => segment.includes("**"))(segments);
  return Option.match(recursive, {
    onNone: () => /\.[A-Za-z0-9]+$/u.test(external),
    onSome: (index) => Function.pipe(segments, Array.take(index), Array.contains("src")),
  });
};

const safeMemo = (context: Context, expression: ESTree.Node): boolean =>
  localValue(context, expression).pipe(
    Option.exists((memo) => {
      if (
        memo.type !== "ObjectExpression" ||
        Array.some<ESTree.ObjectExpression["properties"][number]>(
          (property) =>
            property.type !== "Property" || property.computed || property.kind !== "init",
        )(memo.properties)
      ) {
        return false;
      }
      const names = Function.pipe(
        memo.properties,
        Array.map((property) => {
          if (property.type === "Property") {
            return propertyName(property.key);
          }
          return Option.none<string>();
        }),
        Array.getSomes,
      );
      if (Array.dedupe(names).length !== names.length || Array.contains("exclude")(names)) {
        return false;
      }
      const locked = field(memo, "lockfile").pipe(
        Option.flatMap((value) => localValue(context, value)),
        Option.exists((value) => value.type === "Literal" && value.value === true),
      );
      const included = field(memo, "include").pipe(
        Option.flatMap((value) => localValue(context, value)),
        Option.exists(
          (value) =>
            value.type === "ArrayExpression" &&
            value.elements.length > 0 &&
            Array.every<ESTree.ArrayExpression["elements"][number]>((element) =>
              Option.fromNullishOr(element).pipe(
                Option.flatMap((item) => localValue(context, item)),
                Option.exists(
                  (item) =>
                    item.type === "Literal" &&
                    Predicate.isString(item.value) &&
                    boundedPattern(item.value),
                ),
              ),
            )(value.elements),
        ),
      );
      return locked && included;
    }),
  );

export const boundedBuildMemo = defineRule({
  meta: {
    type: "problem",
    schema: [
      {
        type: "object",
        properties: {
          targets: {
            type: "array",
            minItems: 1,
            items: {
              type: "object",
              properties: { file: { type: "string" }, declaration: { type: "string" } },
              required: ["file", "declaration"],
              additionalProperties: false,
            },
          },
        },
        required: ["targets"],
        additionalProperties: false,
      },
    ],
    messages: {
      options: "Configure exact build-props files and declaration names.",
      memo: "Keep an inspectable memo with bounded source/file globs, lockfile: true and no exclude override. Parent-directory recursive globs must stay inside src; dependency and build-output trees are forbidden.",
    },
  },
  create(context) {
    const options = Array.head(context.options).pipe(
      Option.flatMap(Schema.decodeUnknownOption(Options)),
    );
    return {
      Program(program) {
        Option.match(options, {
          onNone: () => {
            context.report({ node: program, messageId: "options" });
          },
          onSome: ({ targets }) => {
            Function.pipe(
              targets,
              Array.forEach((target) => {
                if (context.filename.replaceAll("\\", "/") !== `${context.cwd}/${target.file}`) {
                  return;
                }
                const declaration = Function.pipe(
                  program.body,
                  Array.flatMap((statement) => {
                    if (statement.type === "VariableDeclaration" && statement.kind === "const") {
                      return statement.declarations;
                    }
                    if (
                      statement.type === "ExportNamedDeclaration" &&
                      statement.declaration?.type === "VariableDeclaration" &&
                      statement.declaration.kind === "const"
                    ) {
                      return statement.declaration.declarations;
                    }
                    return [];
                  }),
                  Array.findFirst(
                    (value) =>
                      value.id.type === "Identifier" && value.id.name === target.declaration,
                  ),
                );
                const valid = declaration.pipe(
                  Option.flatMap((value) => Option.fromNullishOr(value.init)),
                  Option.flatMap((value) => localValue(context, value)),
                  Option.exists(
                    (value) =>
                      value.type === "ObjectExpression" &&
                      // Hosting spreads before memo are safe; later spreads or computed keys could override it.
                      Array.findFirstIndex<ESTree.ObjectExpression["properties"][number]>(
                        (property) =>
                          property.type === "Property" &&
                          Option.contains(propertyName(property.key), "memo"),
                      )(value.properties).pipe(
                        Option.exists(
                          (index) =>
                            Function.pipe(
                              value.properties,
                              Array.drop(index),
                              Array.every(
                                (property) => property.type === "Property" && !property.computed,
                              ),
                            ) &&
                            Array.filter<ESTree.ObjectExpression["properties"][number]>(
                              (property) =>
                                property.type === "Property" &&
                                Option.contains(propertyName(property.key), "memo"),
                            )(value.properties).length === 1,
                        ),
                      ) &&
                      field(value, "memo").pipe(Option.exists((memo) => safeMemo(context, memo))),
                  ),
                );
                if (!valid) {
                  context.report({
                    node: Option.getOrElse(declaration, () => program),
                    messageId: "memo",
                  });
                }
              }),
            );
          },
        });
      },
    };
  },
});
