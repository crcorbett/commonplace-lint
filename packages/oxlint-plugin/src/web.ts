import { eslintCompatPlugin } from "@oxlint/plugins";
import type { ESTree } from "@oxlint/plugins";
import { Array, Option, Predicate } from "effect";
import { propertyName } from "./syntax.js";
import { report, rule } from "./conventions/shared.js";
import { typographyRules } from "./web/typography.js";

const nameOf = (node: ESTree.Node) =>
  node.type === "JSXIdentifier" ? Option.some(node.name) : propertyName(node);
const routes = (filename: string) => /(?:^|\/)src\/routes\/.+\.[jt]sx?$/u.test(filename);
const mdxKeys = [
  "a",
  "blockquote",
  "code",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "hr",
  "img",
  "li",
  "ol",
  "p",
  "pre",
  "table",
  "tbody",
  "td",
  "th",
  "thead",
  "tr",
  "ul",
];

export default eslintCompatPlugin({
  meta: { name: "web" },
  rules: {
    ...typographyRules,
    "no-context-nullish-default": rule(
      "Use canonical Schema-owned metadata and preserve absent values rather than inventing defaults.",
      (context) => ({
        LogicalExpression(node) {
          if (
            node.operator === "??" &&
            node.left.type === "MemberExpression" &&
            Option.exists(propertyName(node.left.property), (name) =>
              Array.contains(["description", "image", "title"], name),
            )
          )
            report(context, node);
        },
      }),
    ),
    "no-page-wrapper": rule(
      "Compose the route in its owning route component rather than delegating to a page-sized wrapper.",
      (context) => ({
        Property(node) {
          if (
            routes(context.filename) &&
            Option.contains(propertyName(node.key), "component") &&
            node.value.type === "Identifier" &&
            /^[A-Z][A-Za-z]*Page$/u.test(node.value.name)
          )
            report(context, node.value);
        },
      }),
    ),
    "no-route-local-seo": rule(
      "Reuse the canonical checked route metadata builder.",
      (context) => ({
        CallExpression(node) {
          if (node.callee.type === "Identifier" && node.callee.name === "seo")
            report(context, node);
        },
      }),
    ),
    "no-route-local-markdown-negotiation": rule(
      "Keep Markdown negotiation in the application's request middleware owner.",
      (context) => ({
        ImportDeclaration(node) {
          if (/[/]seo-aeo[/]markdown-negotiation$/u.test(node.source.value)) report(context, node);
        },
      }),
    ),
    "no-unscoped-server-functions": rule(
      "Use the application's typed runtime boundary rather than creating TanStack server-function wrappers.",
      (context) => ({
        ImportDeclaration(node) {
          if (node.source.value === "@tanstack/react-start")
            Array.forEach(node.specifiers, (specifier) => {
              if (
                specifier.type === "ImportSpecifier" &&
                Option.exists(
                  propertyName(specifier.imported),
                  (name) => name === "createServerFn" || name === "createServerOnlyFn",
                )
              )
                report(context, specifier);
            });
        },
      }),
    ),
    "no-route-json-ld": rule(
      "Let the canonical checked metadata owner encode JSON-LD scripts.",
      (context) => ({
        Property(node) {
          if (
            routes(context.filename) &&
            Option.contains(propertyName(node.key), "type") &&
            node.value.type === "Literal" &&
            node.value.value === "application/ld+json"
          )
            report(context, node.value);
        },
      }),
    ),
    "no-module-owned-public-asset-url": rule(
      "Import module-owned image and pattern assets through the bundler's module graph.",
      (context) => ({
        JSXAttribute(node) {
          if (
            Option.contains(nameOf(node.name), "src") &&
            node.value?.type === "Literal" &&
            Predicate.isString(node.value.value) &&
            /^\/(?:images|patterns)\//u.test(node.value.value)
          )
            report(context, node.value);
        },
      }),
    ),
    "no-http-globals-in-seo": rule(
      "Keep Web HTTP adaptation outside SEO and AEO domain modules.",
      (context) => ({
        Identifier(node) {
          if (
            /(?:\/(?:seo|seo-aeo)\/|\/packages\/aeo\/)/u.test(context.filename) &&
            Array.contains(["Request", "Response", "Headers"], node.name)
          )
            report(context, node);
        },
      }),
    ),
    "no-local-mdx-registry": rule(
      "Reuse a shared MDX component registry rather than rebuilding it in a route or component.",
      (context) => ({
        VariableDeclarator(node) {
          if (
            node.id.type === "Identifier" &&
            (node.id.name === "mdxComponents" ||
              (node.id.name === "components" &&
                node.init?.type === "ObjectExpression" &&
                Array.some(
                  node.init.properties,
                  (property) =>
                    property.type === "Property" &&
                    Option.exists(propertyName(property.key), (name) =>
                      Array.contains(mdxKeys, name),
                    ),
                )))
          )
            report(context, node.id);
        },
        JSXAttribute(node) {
          if (
            Option.contains(nameOf(node.name), "components") &&
            node.parent.type === "JSXOpeningElement" &&
            Option.contains(nameOf(node.parent.name), "MDX") &&
            node.value?.type === "JSXExpressionContainer" &&
            node.value.expression.type === "ObjectExpression"
          )
            report(context, node);
        },
      }),
    ),
  },
});
