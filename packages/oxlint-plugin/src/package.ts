import { defineRule } from "@oxlint/plugins";
import type { ESTree } from "@oxlint/plugins";
import { Array, Chunk, Option, Predicate } from "effect";
import { workspaceImportBoundariesRule } from "./package/workspace-import-boundaries.js";
import { noRedundantRuleRegistrations } from "./config.js";

type ImportNode =
  | ESTree.ImportDeclaration
  | ESTree.ImportExpression
  | ESTree.ExportNamedDeclaration
  | ESTree.ExportAllDeclaration;

const resolveRelative = (fileName: string, specifier: string): string =>
  Chunk.join(
    Array.reduce(
      specifier.split("/"),
      Chunk.fromIterable(Array.dropRight(fileName.split("/"), 1)),
      (segments, segment) =>
        segment === ".."
          ? Chunk.dropRight(segments, 1)
          : segment === "." || segment.length === 0
            ? segments
            : Chunk.append(segments, segment),
    ),
    "/",
  );

const workspaceSourceRoot = (fileName: string): Option.Option<string> =>
  Option.fromNullishOr(fileName.match(/\/(?:apps|packages|content)\/[^/]+(?:\/|$)/u)).pipe(
    Option.flatMap(Array.head),
    Option.map((root) => root.replace(/\/$/u, "")),
  );

const isPrivatePackageAlias = (specifier: string) => /^@[^/]+\/[^/]+\/src(?:\/|$)/u.test(specifier);

const isCrossWorkspaceSourcePath = (fileName: string, specifier: string) => {
  if (!specifier.startsWith(".")) {
    return false;
  }
  const sourceRoot = workspaceSourceRoot(fileName);
  const target = resolveRelative(fileName, specifier);
  const targetRoot = workspaceSourceRoot(target);
  return Option.exists(
    Option.all([sourceRoot, targetRoot]),
    ([source, target]) => source !== target,
  );
};

const noCrossPackageSourceImports = defineRule({
  create(context) {
    const fileName = context.filename.replaceAll("\\", "/");
    const inspect = (node: ImportNode) => {
      const source = node.source;
      if (
        source?.type === "Literal" &&
        Predicate.isString(source.value) &&
        (isPrivatePackageAlias(source.value) || isCrossWorkspaceSourcePath(fileName, source.value))
      ) {
        context.report({ messageId: "noCrossPackageSourceImports", node: source });
      }
    };
    return {
      ExportAllDeclaration: inspect,
      ExportNamedDeclaration: inspect,
      ImportDeclaration: inspect,
      ImportExpression: inspect,
    };
  },
  meta: {
    docs: { description: "Prevent imports from another workspace's private source tree." },
    messages: {
      noCrossPackageSourceImports:
        "Import the package's public export instead of reaching into another workspace's source folder.",
    },
    type: "problem",
  },
});

export default {
  meta: { name: "package" },
  rules: {
    "no-cross-package-source-imports": noCrossPackageSourceImports,
    "workspace-import-boundaries": workspaceImportBoundariesRule,
    "no-redundant-rule-registrations": noRedundantRuleRegistrations,
  },
};
