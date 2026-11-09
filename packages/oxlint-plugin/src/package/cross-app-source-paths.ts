import { defineRule } from "@oxlint/plugins";
import type { ESTree } from "@oxlint/plugins";
import { Array, Chunk, Option, Predicate, Schema } from "effect";

const Options = Schema.Struct({
  apps: Schema.optionalKey(Schema.Array(Schema.NonEmptyString)),
  allowedFiles: Schema.optionalKey(Schema.Array(Schema.NonEmptyString)),
});
// Each `*` matches one folder name, so `apps/*` makes every child of apps an app.
const defaultApps: ReadonlyArray<string> = ["apps/*"];

const segments = (path: string): readonly string[] =>
  Array.filter(path.split("/"), (part) => part.length > 0);

// Resolve `.` and `..` without touching the filesystem.
const normalise = (parts: readonly string[]): readonly string[] =>
  Chunk.toReadonlyArray(
    Array.reduce(parts, Chunk.empty<string>(), (resolved, part) =>
      part === ".."
        ? Chunk.dropRight(resolved, 1)
        : part === "."
          ? resolved
          : Chunk.append(resolved, part),
    ),
  );

// The app root that contains a repository-relative path, matched against each
// configured pattern's leading segments.
const appRoot = (patterns: readonly string[], path: readonly string[]): Option.Option<string> =>
  Array.findFirst(patterns, (pattern) => {
    const expected = segments(pattern);
    return (
      path.length > expected.length &&
      Array.every(expected, (part, index) =>
        Option.exists(Array.get(path, index), (actual) => part === "*" || part === actual),
      )
    );
  }).pipe(Option.map((pattern) => Array.join(Array.take(path, segments(pattern).length), "/")));

// Import sources are owned by package/no-cross-package-source-imports.
const moduleSource = (node: ESTree.Node): boolean => {
  const parent = node.parent;
  return (
    parent !== null &&
    (parent.type === "ImportDeclaration" ||
      parent.type === "ExportNamedDeclaration" ||
      parent.type === "ExportAllDeclaration" ||
      parent.type === "ImportExpression") &&
    parent.source === node
  );
};

const writtenText = (node: ESTree.Node): Option.Option<string> => {
  if (node.type === "Literal" && Predicate.isString(node.value)) return Option.some(node.value);
  if (node.type === "TemplateElement") return Option.fromNullishOr(node.value.cooked);
  return Option.none();
};

export const noCrossAppSourcePaths = defineRule({
  meta: {
    type: "problem",
    docs: {
      description:
        "Reject file paths from one app into another app's private src folder, including test file reads.",
    },
    schema: [
      {
        type: "object",
        properties: {
          apps: {
            type: "array",
            minItems: 1,
            items: { type: "string", pattern: "^[\\w.@*-]+(?:/[\\w.@*-]+)*$" },
          },
          allowedFiles: { type: "array", items: { type: "string", minLength: 1 } },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      path: "{{source}} reads {{target}}'s private source. Use the app's public package export, built output or a shared fixture owner.",
    },
  },
  create(context) {
    const options = Array.head(context.options).pipe(
      Option.flatMap(Schema.decodeUnknownOption(Options)),
      Option.getOrElse((): typeof Options.Type => ({})),
    );
    const cwd = context.cwd.replaceAll("\\", "/").replace(/\/$/u, "");
    const filename = context.filename.replaceAll("\\", "/");
    if (!filename.startsWith(`${cwd}/`)) return {};
    const relative = filename.slice(cwd.length + 1);
    if (Array.contains(options.allowedFiles ?? [], relative)) return {};
    const patterns = options.apps ?? defaultApps;
    const file = segments(relative);
    return Option.match(appRoot(patterns, file), {
      onNone: () => ({}),
      onSome: (source) => {
        const directory = Array.dropRight(file, 1);
        // A relative path resolves from this file; any other path is read as
        // repository-relative, which also covers `${root}/apps/...` templates.
        const target = (text: string): Option.Option<string> => {
          const trimmed = text.trim();
          const resolved = trimmed.startsWith(".")
            ? normalise([...directory, ...segments(trimmed)])
            : normalise(segments(trimmed));
          return appRoot(patterns, resolved).pipe(
            Option.filter(
              (root) =>
                root !== source &&
                Option.contains(Array.get(resolved, segments(root).length), "src"),
            ),
          );
        };
        const visit = (node: ESTree.Node) => {
          if (moduleSource(node)) return;
          Option.match(writtenText(node).pipe(Option.flatMap(target)), {
            onNone: () => {},
            onSome: (root) => {
              context.report({ node, messageId: "path", data: { source, target: root } });
            },
          });
        };
        return { Literal: visit, TemplateElement: visit };
      },
    });
  },
});
