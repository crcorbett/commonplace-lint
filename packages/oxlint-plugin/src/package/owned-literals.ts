import { defineRule } from "@oxlint/plugins";
import type { ESTree } from "@oxlint/plugins";
import { Array, Option, Predicate, Schema } from "effect";
import { testFile } from "../conventions/shared.js";

const OwnedValue = Schema.Union([Schema.NonEmptyString, Schema.Finite]);
const Options = Schema.Struct({
  ownedLiterals: Schema.NonEmptyArray(
    Schema.Struct({
      value: OwnedValue,
      owner: Schema.NonEmptyString,
      allowedFiles: Schema.Array(Schema.NonEmptyString),
    }),
  ),
  allowTestFiles: Schema.optionalKey(Schema.Boolean),
});
type OwnedLiteral = (typeof Options.Type)["ownedLiterals"][number];

// Paths are exact and relative to the Oxlint working directory, never folders.
const ownedFile = (filename: string, cwd: string, file: string) =>
  !file.includes("*") &&
  !file.includes("..") &&
  !file.startsWith("/") &&
  filename.replaceAll("\\", "/") === `${cwd.replaceAll("\\", "/").replace(/\/$/u, "")}/${file}`;

// The complete value one literal writes. A template counts only without
// substitutions, so a computed string is never compared with an owned value.
const writtenValue = (node: ESTree.Node): Option.Option<string | number> => {
  if (node.type === "Literal") {
    return Predicate.isString(node.value) || Predicate.isNumber(node.value)
      ? Option.some(node.value)
      : Option.none();
  }
  if (node.type === "TemplateLiteral" && node.expressions.length === 0)
    return Array.head(node.quasis).pipe(
      Option.flatMap((quasi) => Option.fromNullishOr(quasi.value.cooked)),
    );
  return Option.none();
};

// A property key, import source or type position names something; it does not
// copy the owned setting.
const valuePosition = (node: ESTree.Node): boolean => {
  const parent = node.parent;
  if (parent === null) return true;
  if (parent.type === "Property" && parent.key === node && !parent.computed) return false;
  if (
    (parent.type === "ImportDeclaration" ||
      parent.type === "ExportNamedDeclaration" ||
      parent.type === "ExportAllDeclaration" ||
      parent.type === "ImportExpression") &&
    parent.source === node
  )
    return false;
  return parent.type !== "TSLiteralType";
};

export const noDuplicatedOwnedLiterals = defineRule({
  meta: {
    type: "problem",
    docs: {
      description: "Reject literal settings written again outside the module that owns them.",
    },
    schema: [
      {
        type: "object",
        properties: {
          ownedLiterals: {
            type: "array",
            minItems: 1,
            items: {
              type: "object",
              properties: {
                value: { anyOf: [{ type: "string", minLength: 1 }, { type: "number" }] },
                owner: { type: "string", minLength: 1 },
                allowedFiles: { type: "array", items: { type: "string", minLength: 1 } },
              },
              required: ["value", "owner", "allowedFiles"],
              additionalProperties: false,
            },
          },
          allowTestFiles: { type: "boolean" },
        },
        required: ["ownedLiterals"],
        additionalProperties: false,
      },
    ],
    messages: {
      options: "Configure the owned literal values, their owners and exact owner files.",
      owned:
        "{{value}} is owned by {{owner}}. Import the owner's value instead of writing it again.",
    },
  },
  create(context) {
    const options = Array.head(context.options).pipe(
      Option.flatMap(Schema.decodeUnknownOption(Options)),
    );
    if (Option.isNone(options)) {
      return {
        Program(node) {
          context.report({ node, messageId: "options" });
        },
      };
    }
    if (options.value.allowTestFiles === true && testFile(context.filename)) return {};
    const active = Array.filter(
      options.value.ownedLiterals,
      (entry) =>
        !Array.some(entry.allowedFiles, (file) => ownedFile(context.filename, context.cwd, file)),
    );
    if (!Array.isReadonlyArrayNonEmpty(active)) return {};
    const visit = (node: ESTree.Node) => {
      if (!valuePosition(node)) return;
      Option.match(
        writtenValue(node).pipe(
          Option.flatMap((value) =>
            Array.findFirst(active, (entry: OwnedLiteral) => entry.value === value),
          ),
        ),
        {
          onNone: () => {},
          onSome: ({ value, owner }) => {
            context.report({
              node,
              messageId: "owned",
              data: { value: String(value), owner },
            });
          },
        },
      );
    };
    return { Literal: visit, TemplateLiteral: visit };
  },
});
