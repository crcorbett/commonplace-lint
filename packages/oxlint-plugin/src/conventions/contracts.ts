import type { ESTree } from "@oxlint/plugins";
import { Array, Option } from "effect";
import { operation } from "../native-reference.js";
import { propertyName } from "../syntax.js";
import { contains, memberName, plainStringSchema, report, rule } from "./shared.js";

const identityNames = [
  "canonicalPath",
  "contentPath",
  "cursor",
  "id",
  "mimeType",
  "operation",
  "slug",
  "uri",
  "uriTemplate",
  "url",
];
const ancestor = (node: ESTree.Node, accepts: (node: ESTree.Node) => boolean): boolean =>
  node.parent !== null && (accepts(node.parent) || ancestor(node.parent, accepts));

export const contractRules = {
  "branded-identifier-schema": rule(
    "Use the owning branded or literal Schema for identifier fields.",
    (context) => ({
      Property(node) {
        if (
          Option.exists(propertyName(node.key), (name) => Array.contains(identityNames, name)) &&
          plainStringSchema(context, node.value)
        )
          report(context, node.value);
      },
    }),
  ),
  "no-raw-semantic-identifier": rule(
    "Use the owning branded identifier type instead of string.",
    (context) => ({
      TSPropertySignature(node) {
        if (
          Option.exists(propertyName(node.key), (name) =>
            Array.contains(["id", "identifier", "slug"], name.toLowerCase()),
          ) &&
          node.typeAnnotation?.typeAnnotation.type === "TSStringKeyword"
        )
          report(context, node);
      },
    }),
  ),
  "no-generic-client-escape": rule(
    "Expose named semantic operations instead of a generic client callback.",
    (context) => {
      const check = (node: ESTree.TSPropertySignature | ESTree.TSMethodSignature) => {
        if (
          Option.exists(propertyName(node.key), (name) =>
            Array.contains(["use", "useClient", "withClient"], name),
          )
        )
          report(context, node);
      };
      return { TSPropertySignature: check, TSMethodSignature: check };
    },
  ),
  "no-unknown-service-contract": rule(
    "Service inputs and Effect error channels use Schema-derived types and closed tagged failures.",
    (context) => ({
      TSUnknownKeyword(node) {
        const parent = node.parent;
        if (
          (parent.type === "TSTypeAnnotation" &&
            ancestor(
              parent,
              (value) => value.type === "TSFunctionType" || value.type === "TSMethodSignature",
            )) ||
          (parent.type === "TSTypeParameterInstantiation" &&
            Array.get(parent.params, 1).pipe(Option.exists((value) => value === node)) &&
            parent.parent.type === "TSTypeReference" &&
            parent.parent.typeName.type === "TSQualifiedName" &&
            Option.contains(propertyName(parent.parent.typeName.right), "Effect"))
        )
          report(context, node);
      },
    }),
  ),
  "no-unknown-tagged-error-payload": rule(
    "Tagged errors expose safe checked fields rather than Schema.Unknown.",
    (context) => ({
      Property(node) {
        if (
          operation(context, node.value, "effect/Schema", "Unknown") &&
          ancestor(node, (value) => {
            const factory = (call: ESTree.Node): boolean =>
              call.type === "CallExpression" &&
              (Option.exists(
                memberName(context, call.callee, "effect/Schema"),
                (name) => name === "TaggedError" || name === "TaggedErrorClass",
              ) ||
                factory(call.callee));
            return factory(value);
          })
        )
          report(context, node.value);
      },
    }),
  ),
  "no-host-api-in-contract": rule(
    "Keep service, Schema, error and config contracts portable; acquire host APIs in private adapters.",
    (context) => ({
      ImportDeclaration(node) {
        if (
          /(?:^|\/)(?:services?|schemas?|errors|config)\.ts$/u.test(context.filename) &&
          /^(?:node:|bun$|playwright$|lighthouse$|chrome-launcher$|alchemy(?:\/|$)|@alchemy\.run\/|@cloudflare(?:\/|$)|cloudflare$|@octokit(?:\/|$)|@actions(?:\/|$)|@sentry(?:\/|$)|stripe$|resend$|@aws(?:\/|$)|aws-sdk$)/u.test(
            node.source.value,
          )
        )
          report(context, node.source);
      },
    }),
  ),
  "no-layer-export-in-service": rule(
    "Keep service contracts separate from live and test Layer wiring.",
    (context) => ({
      ExportNamedDeclaration(node) {
        if (
          !/(?:^|\/)services?\.ts$/u.test(context.filename) ||
          node.declaration?.type !== "VariableDeclaration"
        )
          return;
        Array.forEach(node.declaration.declarations, (declaration) => {
          if (
            declaration.id.type === "Identifier" &&
            /(?:Live|Mock|Test|TestLive)$/u.test(declaration.id.name)
          )
            report(context, declaration.id);
        });
      },
    }),
  ),
  "no-defecting-web-crypto": rule(
    "Map crypto.subtle.digest rejection to a typed error at its adapter boundary.",
    (context) => ({
      CallExpression(node) {
        if (
          operation(context, node.callee, "effect/Effect", "promise") &&
          contains(
            context,
            node,
            (value) =>
              value.type === "MemberExpression" &&
              Option.contains(propertyName(value.property), "digest") &&
              value.object.type === "MemberExpression" &&
              Option.contains(propertyName(value.object.property), "subtle"),
          )
        )
          report(context, node);
      },
    }),
  ),
  "no-mixed-test-globals": rule(
    "Alias Effect's it helper when mixing it with native Vitest globals.",
    (context) => ({
      Program(node) {
        const imports = Array.filter(
          node.body,
          (statement) => statement.type === "ImportDeclaration",
        );
        const imported = (source: string, names: readonly string[]) =>
          Array.some(
            imports,
            (statement) =>
              statement.type === "ImportDeclaration" &&
              statement.source.value === source &&
              Array.some(
                statement.specifiers,
                (specifier) =>
                  specifier.type === "ImportSpecifier" &&
                  Option.exists(
                    propertyName(specifier.imported),
                    (name) => Array.contains(names, name) && specifier.local.name === name,
                  ),
              ),
          );
        if (imported("@effect/vitest", ["it"]) && imported("vitest", ["it", "describe"]))
          report(context, node);
      },
    }),
  ),
};
