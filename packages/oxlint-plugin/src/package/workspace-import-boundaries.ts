import { defineRule } from "@oxlint/plugins";
import type { Context, ESTree } from "@oxlint/plugins";
import { Array, Chunk, Number, Option, Predicate, Record, Schema } from "effect";
import { variableInScope } from "../syntax.js";

// A checked manifest consumer selects export conditions before configuring this
// pure rule. A false entry preserves a manifest's explicit null export fence.
const Options = Schema.Struct({
  owners: Schema.Array(Schema.Struct({ id: Schema.String, root: Schema.String })),
  workspaces: Schema.Array(
    Schema.Struct({
      name: Schema.String,
      owner: Schema.String,
      exports: Schema.Record(Schema.String, Schema.Boolean),
    }),
  ),
  workspacePrefixes: Schema.Array(Schema.String),
  forbiddenEdges: Schema.Array(Schema.Struct({ from: Schema.String, to: Schema.String })),
  exceptions: Schema.Array(Schema.Struct({ fromFile: Schema.String, toModule: Schema.String })),
  aliases: Schema.Array(Schema.Struct({ prefix: Schema.String, root: Schema.String })),
});
type Options = typeof Options.Type;

const normalise = (path: string): string => path.replaceAll("\\", "/");
const inside = (path: string, root: string): boolean =>
  root === "." || path === root || path.startsWith(`${root}/`);
const cleanPath = (path: string): boolean =>
  path.length > 0 &&
  !/[\\:*?#%]/u.test(path) &&
  !path.includes("\u0000") &&
  !path.startsWith("/") &&
  Array.every(path.split("/"), (part) => part.length > 0 && part !== "." && part !== "..");
const rootPath = (path: string): boolean => path === "." || cleanPath(path);
const packageName = (name: string): boolean =>
  /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/u.test(name);
const unique = (values: readonly string[]): boolean =>
  Array.dedupe(values).length === values.length;
const ownerAt = (options: Options, path: string) =>
  Array.head(
    Array.sort(
      Array.filter(options.owners, ({ root }) => inside(path, root)),
      (left: Options["owners"][number], right: Options["owners"][number]) =>
        Number.Order(
          right.root === "." ? 0 : right.root.length,
          left.root === "." ? 0 : left.root.length,
        ),
    ),
  );
const exportKey = (key: string): boolean =>
  key === "." ||
  (key.startsWith("./") &&
    key.split("*").length <= 2 &&
    cleanPath(key.slice(2).replace("*", "pattern")));
const validSubpath = (key: string): boolean =>
  key === "." ||
  (key.startsWith("./") &&
    cleanPath(key.slice(2)) &&
    !Array.contains(key.slice(2).split("/"), "node_modules"));
const patternMatch = (pattern: string, key: string): boolean => {
  const star = pattern.indexOf("*");
  return (
    star >= 0 &&
    key.startsWith(pattern.slice(0, star)) &&
    key.endsWith(pattern.slice(star + 1)) &&
    key.length >= pattern.length - 1
  );
};
const exported = (exports: Options["workspaces"][number]["exports"], key: string): boolean => {
  if (!validSubpath(key)) return false;
  return Record.get(exports, key).pipe(
    Option.orElse(() =>
      Array.head(
        Array.sort(
          Array.filter(Record.keys(exports), (pattern) => patternMatch(pattern, key)),
          (left: string, right: string) =>
            Number.Order(right.indexOf("*"), left.indexOf("*")) ||
            Number.Order(right.length, left.length),
        ),
      ).pipe(Option.flatMap((pattern) => Record.get(exports, pattern))),
    ),
    Option.getOrElse(() => false),
  );
};
const workspaceAt = (options: Options, address: string) =>
  Array.findFirst(
    options.workspaces,
    ({ name }) => address === name || address.startsWith(`${name}/`),
  );
const publicAddress = (options: Options, address: string): boolean =>
  Option.exists(workspaceAt(options, address), (workspace) =>
    exported(
      workspace.exports,
      address === workspace.name ? "." : `.${address.slice(workspace.name.length)}`,
    ),
  );
const validOptions = (options: Options): boolean =>
  Array.some(options.owners, ({ root }) => root === ".") &&
  unique(Array.map(options.owners, ({ id }) => id)) &&
  unique(Array.map(options.owners, ({ root }) => root)) &&
  Array.every(options.owners, ({ id, root }) => id.length > 0 && rootPath(root)) &&
  unique(Array.map(options.workspaces, ({ name }) => name)) &&
  unique(Array.map(options.workspaces, ({ owner }) => owner)) &&
  Array.every(
    options.workspaces,
    (workspace) =>
      packageName(workspace.name) &&
      Array.some(options.owners, ({ id }) => id === workspace.owner) &&
      Array.every(Record.keys(workspace.exports), exportKey),
  ) &&
  unique(options.workspacePrefixes) &&
  Array.every(
    options.workspacePrefixes,
    (prefix) => /^@[a-z0-9][a-z0-9._-]*\/$/u.test(prefix) || packageName(prefix),
  ) &&
  unique(Array.map(options.forbiddenEdges, ({ from, to }) => `${from}\u0000${to}`)) &&
  Array.every(
    options.forbiddenEdges,
    ({ from, to }) =>
      from !== to &&
      Array.every([from, to], (endpoint) =>
        Array.some(options.owners, ({ id }) => id === endpoint),
      ),
  ) &&
  unique(Array.map(options.aliases, ({ prefix }) => prefix)) &&
  Array.every(
    options.aliases,
    ({ prefix, root }) =>
      prefix.endsWith("/") &&
      (prefix === "#/" || cleanPath(prefix.slice(0, -1))) &&
      rootPath(root) &&
      !Array.some(
        options.workspaces,
        ({ name }) => name.startsWith(prefix) || prefix.startsWith(`${name}/`),
      ),
  ) &&
  unique(
    Array.map(options.exceptions, ({ fromFile, toModule }) => `${fromFile}\u0000${toModule}`),
  ) &&
  Array.every(
    options.exceptions,
    ({ fromFile, toModule }) =>
      cleanPath(fromFile) &&
      publicAddress(options, toModule) &&
      Option.exists(
        Option.all([ownerAt(options, fromFile), workspaceAt(options, toModule)]),
        ([from, to]) =>
          Array.some(
            options.forbiddenEdges,
            (edge) => edge.from === from.id && edge.to === to.owner,
          ),
      ),
  );

// Scope-aware immutable string aliases only; no evaluation or type resolution.
const moduleAddress = (
  context: Context,
  node: ESTree.Node,
  visited: readonly ESTree.Node[] = [],
): Option.Option<string> => {
  if (visited.length >= 64 || Array.some(visited, (previous) => previous === node))
    return Option.none();
  const next = [...visited, node];
  if (node.type === "Literal" && Predicate.isString(node.value)) return Option.some(node.value);
  if (node.type === "TemplateLiteral") {
    return Option.all(
      Array.map(node.quasis, (quasi, index) =>
        Option.all([
          Option.fromNullishOr(quasi.value.cooked),
          Array.get(node.expressions, index).pipe(
            Option.match({
              onNone: () => Option.some(""),
              onSome: (expression) => moduleAddress(context, expression, next),
            }),
          ),
        ]).pipe(Option.map(([text, expression]) => text + expression)),
      ),
    ).pipe(Option.map(Array.join("")));
  }
  if (node.type === "BinaryExpression" && node.operator === "+") {
    return Option.all([
      moduleAddress(context, node.left, next),
      moduleAddress(context, node.right, next),
    ]).pipe(Option.map(([left, right]) => left + right));
  }
  if (node.type !== "Identifier") return Option.none();
  return variableInScope(context.sourceCode.getScope(node), node.name).pipe(
    Option.filter(
      (variable) =>
        variable.defs.length === 1 &&
        Array.every(variable.references, (reference) => !reference.isWrite() || reference.init),
    ),
    Option.flatMap((variable) => Array.head(variable.defs)),
    Option.flatMap((definition) =>
      definition.node.type === "VariableDeclarator" &&
      definition.node.id.type === "Identifier" &&
      definition.parent?.type === "VariableDeclaration" &&
      definition.parent.kind === "const"
        ? Option.fromNullishOr(definition.node.init)
        : Option.none(),
    ),
    Option.flatMap((initialiser) => moduleAddress(context, initialiser, next)),
  );
};
const resolvePath = (base: string, address: string): string =>
  Chunk.join(
    Array.reduce(
      address.split("/"),
      Chunk.fromIterable(base === "." || base === "" ? [] : base.split("/")),
      (parts, part) =>
        part === ".."
          ? parts.length === 0 || Option.contains(Chunk.last(parts), "..")
            ? Chunk.append(parts, "..")
            : Chunk.dropRight(parts, 1)
          : part === "." || part === ""
            ? parts
            : Chunk.append(parts, part),
    ),
    "/",
  );
const relativeFile = (filename: string, cwd: string): Option.Option<string> => {
  const file = normalise(filename);
  const root = normalise(cwd).replace(/\/$/u, "");
  return file.startsWith(`${root}/`) ? Option.some(file.slice(root.length + 1)) : Option.none();
};
const fileAddress = (address: string): string => address.replace(/[?#].*$/u, "");
const forbidden = (options: Options, file: string, rawAddress: string, cwd: string): boolean => {
  const address = normalise(rawAddress);
  const from = ownerAt(options, file);
  const alias = Array.head(
    Array.sort(
      Array.filter(options.aliases, ({ prefix }) => address.startsWith(prefix)),
      (left: Options["aliases"][number], right: Options["aliases"][number]) =>
        Number.Order(right.prefix.length, left.prefix.length),
    ),
  );
  if (Option.isSome(alias)) {
    const target = resolvePath(
      alias.value.root,
      fileAddress(address.slice(alias.value.prefix.length)),
    );
    return (
      !cleanPath(target) ||
      !inside(target, alias.value.root) ||
      !Option.exists(Option.all([from, ownerAt(options, target)]), ([a, b]) => a.id === b.id)
    );
  }
  if (
    address.startsWith(".") ||
    address.startsWith("/") ||
    /^[a-z]:\//iu.test(address) ||
    address.startsWith("file:")
  ) {
    const target = address.startsWith(".")
      ? Option.some(
          resolvePath(Array.join(Array.dropRight(file.split("/"), 1), "/"), fileAddress(address)),
        )
      : relativeFile(fileAddress(address), cwd).pipe(Option.map((path) => resolvePath(".", path)));
    return !Option.exists(
      target,
      (path) =>
        cleanPath(path) &&
        Option.exists(Option.all([from, ownerAt(options, path)]), ([a, b]) => a.id === b.id),
    );
  }
  return Option.match(workspaceAt(options, address), {
    onNone: () =>
      Array.some(options.workspacePrefixes, (prefix) =>
        prefix.endsWith("/")
          ? address.startsWith(prefix)
          : address === prefix || address.startsWith(`${prefix}/`),
      ),
    onSome: (workspace) =>
      !publicAddress(options, address) ||
      (Option.exists(from, (owner) =>
        Array.some(
          options.forbiddenEdges,
          (edge) => edge.from === owner.id && edge.to === workspace.owner,
        ),
      ) &&
        !Array.some(
          options.exceptions,
          (exception) => exception.fromFile === file && exception.toModule === address,
        )),
  });
};

export const workspaceImportBoundariesRule = defineRule({
  meta: {
    type: "problem",
    docs: {
      description:
        "Enforce checked workspace exports, owner edges and exact public-import exceptions.",
    },
    schema: [
      {
        type: "object",
        additionalProperties: false,
        required: [
          "owners",
          "workspaces",
          "workspacePrefixes",
          "forbiddenEdges",
          "exceptions",
          "aliases",
        ],
        properties: {
          owners: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["id", "root"],
              properties: { id: { type: "string" }, root: { type: "string" } },
            },
          },
          workspaces: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["name", "owner", "exports"],
              properties: {
                name: { type: "string" },
                owner: { type: "string" },
                exports: { type: "object", additionalProperties: { type: "boolean" } },
              },
            },
          },
          workspacePrefixes: { type: "array", items: { type: "string" } },
          forbiddenEdges: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["from", "to"],
              properties: { from: { type: "string" }, to: { type: "string" } },
            },
          },
          exceptions: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["fromFile", "toModule"],
              properties: { fromFile: { type: "string" }, toModule: { type: "string" } },
            },
          },
          aliases: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["prefix", "root"],
              properties: { prefix: { type: "string" }, root: { type: "string" } },
            },
          },
        },
      },
    ],
    messages: {
      options:
        "Supply valid checked workspace contracts, anchored owners and exact exceptions; boundary configuration is missing or inconsistent.",
      boundary:
        "Use an allowed public workspace export. Direct owner crossings, private exports and forbidden owner edges are denied.",
    },
  },
  create(context) {
    const options = Array.head(context.options).pipe(
      Option.flatMap(Schema.decodeUnknownOption(Options, { onExcessProperty: "error" })),
      Option.filter(validOptions),
    );
    const file = relativeFile(context.filename, context.cwd);
    const inspect = (node: ESTree.Node, source: ESTree.Node) => {
      if (Option.isNone(options) || Option.isNone(file)) return;
      Option.match(moduleAddress(context, source), {
        onNone: () => undefined,
        onSome: (address) => {
          if (forbidden(options.value, file.value, address, context.cwd))
            context.report({ node, messageId: "boundary" });
        },
      });
    };
    return {
      Program(node) {
        if (context.options.length !== 1 || Option.isNone(options) || Option.isNone(file))
          context.report({ node, messageId: "options" });
      },
      ImportDeclaration(node) {
        inspect(node, node.source);
      },
      ImportExpression(node) {
        inspect(node, node.source);
      },
      ExportNamedDeclaration(node) {
        if (node.source) inspect(node, node.source);
      },
      ExportAllDeclaration(node) {
        inspect(node, node.source);
      },
      TSImportType(node) {
        inspect(node, node.source);
      },
      TSImportEqualsDeclaration(node) {
        if (node.moduleReference.type === "TSExternalModuleReference")
          inspect(node, node.moduleReference.expression);
      },
      CallExpression(node) {
        if (
          node.callee.type === "Identifier" &&
          node.callee.name === "require" &&
          Option.isNone(variableInScope(context.sourceCode.getScope(node), "require"))
        ) {
          Option.match(Array.head(node.arguments), {
            onNone: () => undefined,
            onSome: (source) => inspect(node, source),
          });
        }
      },
    };
  },
});
