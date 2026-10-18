import { defineRule } from "@oxlint/plugins";
import type { Context } from "@oxlint/plugins";
import { Array, Option, Schema } from "effect";
import { operation } from "../native-reference.js";
import { propertyName } from "../syntax.js";

const Paths = Schema.Array(Schema.NonEmptyString);
const BrowserOptions = Schema.Struct({ runtimeOwners: Paths, registryOwners: Paths });
const ClientOptions = Schema.Struct({ browserOwners: Paths, serverOwners: Paths });
const pathsSchema = {
  type: "array",
  items: { type: "string", minLength: 1 },
  uniqueItems: true,
} as const;
const owns = (context: Context, paths: readonly string[]) => {
  const filename = context.filename.replaceAll("\\", "/");
  const cwd = context.cwd.replaceAll("\\", "/").replace(/\/$/u, "");
  return Array.some(paths, (path) => filename === `${cwd}/${path}`);
};

export const browserRuntimeOwnership = defineRule({
  meta: {
    type: "problem",
    schema: [
      {
        type: "object",
        properties: { runtimeOwners: pathsSchema, registryOwners: pathsSchema },
        required: ["runtimeOwners", "registryOwners"],
        additionalProperties: false,
      },
    ],
    messages: {
      runtime: "Construct Atom.runtime only in its configured runtime owners.",
      registry: "Mount RegistryProvider only in its configured registry owner.",
    },
  },
  create(context) {
    // Oxlint owns synchronous option validation; malformed permissions fail closed.
    const options = Array.head(context.options).pipe(
      Option.flatMap(Schema.decodeUnknownOption(BrowserOptions)),
      Option.getOrElse(() => ({ runtimeOwners: [], registryOwners: [] })),
    );
    return {
      CallExpression(node) {
        if (
          operation(context, node.callee, "effect/reactivity/Atom", "runtime") &&
          !owns(context, options.runtimeOwners)
        )
          context.report({ node, messageId: "runtime" });
      },
      ImportDeclaration(node) {
        if (
          node.importKind === "type" ||
          !node.source.value.startsWith("@effect/atom-react") ||
          owns(context, options.registryOwners)
        )
          return;
        if (
          Array.some(
            node.specifiers,
            (specifier) =>
              specifier.type === "ImportNamespaceSpecifier" ||
              (specifier.type === "ImportSpecifier" &&
                specifier.importKind !== "type" &&
                Option.contains(propertyName(specifier.imported), "RegistryProvider")),
          )
        )
          context.report({ node, messageId: "registry" });
      },
    };
  },
});

export const nativeHttpClientOwnership = defineRule({
  meta: {
    type: "problem",
    schema: [
      {
        type: "object",
        properties: { browserOwners: pathsSchema, serverOwners: pathsSchema },
        required: ["browserOwners", "serverOwners"],
        additionalProperties: false,
      },
    ],
    messages: {
      browser: "Construct AtomHttpApi.Service only in its configured browser owner.",
      server: "Construct HttpApiClient only in its configured binding adapter or response tests.",
    },
  },
  create(context) {
    const options = Array.head(context.options).pipe(
      Option.flatMap(Schema.decodeUnknownOption(ClientOptions)),
      Option.getOrElse(() => ({ browserOwners: [], serverOwners: [] })),
    );
    return {
      CallExpression(node) {
        if (
          operation(context, node.callee, "effect/reactivity/AtomHttpApi", "Service") &&
          !owns(context, options.browserOwners)
        )
          context.report({ node, messageId: "browser" });
        if (
          Array.some(["make", "makeWith"], (method) =>
            operation(context, node.callee, "effect/http-api/HttpApiClient", method),
          ) &&
          !owns(context, options.serverOwners)
        )
          context.report({ node, messageId: "server" });
      },
    };
  },
});
