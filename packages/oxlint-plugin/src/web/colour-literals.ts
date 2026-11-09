import { defineRule } from "@oxlint/plugins";
import type { ESTree } from "@oxlint/plugins";
import { Array, Option, Predicate, Schema } from "effect";
import { testFile } from "../conventions/shared.js";
import { propertyName } from "../syntax.js";

const Options = Schema.Struct({
  allowedFiles: Schema.optionalKey(Schema.Array(Schema.NonEmptyString)),
  allowTestFiles: Schema.optionalKey(Schema.Boolean),
});
// Token and theme modules own colour values unless the consumer names its owners.
const defaultTokenFiles: ReadonlyArray<string> = ["**/*tokens*", "**/*theme*"];

// Repository-relative globs: `**` crosses folders, `*` and `?` stay in one segment.
const globPattern = (glob: string): RegExp =>
  new RegExp(
    `^${Array.join(
      Array.map(glob.split(/(\*\*\/|\*\*|\*|\?)/u), (part) =>
        part === "**/"
          ? "(?:.*/)?"
          : part === "**"
            ? ".*"
            : part === "*"
              ? "[^/]*"
              : part === "?"
                ? "[^/]"
                : part.replaceAll(/[.+^${}()|[\]\\]/gu, "\\$&"),
      ),
      "",
    )}$`,
    "u",
  );

const functional = /\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\([^)]*\)?/iu;
const wholeHex = /^\s*#(?:[\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})\s*$/iu;
// Six- and eight-digit hex values are colours wherever they are written as a token.
const longHex = /(?<=^|[\s(,:[])#(?:[\da-f]{8}|[\da-f]{6})(?![\w-])/iu;
// Short forms such as `#123` are also issue numbers, so they need a style context.
const shortHex = /(?<=^|[\s(,:[])#[\da-f]{3,4}(?![\w-])/iu;
const declaration = /[a-z-]+\s*:\s*[^;]*#[\da-f]{3,4}(?![\w-])/iu;
const colourKey =
  /^(?:colou?r|fill|stroke|background|outline|caret|accent|stopColou?r|floodColou?r|lightingColou?r)|(?:colou?r|background|border|shadow|outline|fill|stroke)$/iu;
const colourAttributes: ReadonlyArray<string> = [
  "color",
  "fill",
  "stroke",
  "stopColor",
  "stop-color",
  "floodColor",
  "flood-color",
  "lightingColor",
  "lighting-color",
  "bgcolor",
];

const writtenText = (node: ESTree.Node): Option.Option<string> => {
  if (node.type === "Literal" && Predicate.isString(node.value)) return Option.some(node.value);
  if (node.type === "TemplateElement") return Option.fromNullishOr(node.value.cooked);
  return Option.none();
};

// A value sits in a style context when it is a colour-named property value, a
// colour JSX attribute or part of a tagged CSS template such as styled`...`.
const styleContext = (node: ESTree.Node): boolean => {
  const parent = node.parent;
  if (parent === null) return false;
  if (parent.type === "Property" && parent.value === node)
    return Option.exists(propertyName(parent.key), (name) => colourKey.test(name));
  if (parent.type === "JSXAttribute")
    return (
      parent.name.type === "JSXIdentifier" &&
      (parent.name.name === "style" || Array.contains(colourAttributes, parent.name.name))
    );
  if (parent.type === "TemplateLiteral") return parent.parent?.type === "TaggedTemplateExpression";
  if (
    parent.type === "ConditionalExpression" ||
    parent.type === "LogicalExpression" ||
    parent.type === "JSXExpressionContainer" ||
    parent.type === "TSAsExpression" ||
    parent.type === "TSSatisfiesExpression"
  )
    return styleContext(parent);
  return false;
};

const firstMatch = (pattern: RegExp, text: string): Option.Option<string> =>
  Option.fromNullishOr(pattern.exec(text)).pipe(Option.flatMap(Array.head));

// The first colour the literal writes, if any.
const colourLiteral = (node: ESTree.Node, text: string): Option.Option<string> =>
  firstMatch(wholeHex, text).pipe(
    Option.orElse(() => firstMatch(functional, text)),
    Option.orElse(() => firstMatch(longHex, text)),
    Option.orElse(() =>
      styleContext(node) || declaration.test(text) || /-\[#/u.test(text)
        ? firstMatch(shortHex, text)
        : Option.none(),
    ),
    Option.map((colour) => colour.trim()),
  );

const noColourLiterals = defineRule({
  meta: {
    type: "problem",
    docs: {
      description:
        "Reject hex and functional colour literals outside the design token or theme owners.",
    },
    schema: [
      {
        type: "object",
        properties: {
          allowedFiles: { type: "array", items: { type: "string", minLength: 1 } },
          allowTestFiles: { type: "boolean" },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      colour:
        "Use a design token instead of the colour literal {{colour}}. Colour values belong in the configured token or theme files.",
    },
  },
  create(context) {
    // Oxlint validates the JSON schema first; an unexpected shape keeps the defaults.
    const options = Array.head(context.options).pipe(
      Option.flatMap(Schema.decodeUnknownOption(Options)),
      Option.getOrElse((): typeof Options.Type => ({})),
    );
    const filename = context.filename.replaceAll("\\", "/");
    const cwd = context.cwd.replaceAll("\\", "/").replace(/\/$/u, "");
    const relative = filename.startsWith(`${cwd}/`) ? filename.slice(cwd.length + 1) : filename;
    const owners = Array.map(options.allowedFiles ?? defaultTokenFiles, globPattern);
    if (
      Array.some(owners, (owner) => owner.test(relative)) ||
      (options.allowTestFiles === true && testFile(filename))
    )
      return {};
    const visit = (node: ESTree.Node) => {
      Option.match(writtenText(node).pipe(Option.flatMap((text) => colourLiteral(node, text))), {
        onNone: () => {},
        onSome: (colour) => {
          context.report({ node, messageId: "colour", data: { colour } });
        },
      });
    };
    return { Literal: visit, TemplateElement: visit };
  },
});

export const colourRules = { "no-colour-literals": noColourLiterals };
