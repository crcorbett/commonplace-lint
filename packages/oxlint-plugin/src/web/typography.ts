import type { ESTree } from "@oxlint/plugins";
import { Array, Option, Predicate } from "effect";
import { report, rule } from "../conventions/shared.js";

const stringValue = (node: ESTree.Node): Option.Option<string> =>
  node.type === "Literal" && Predicate.isString(node.value)
    ? Option.some(node.value)
    : node.type === "TemplateElement"
      ? Option.some(node.value.cooked ?? node.value.raw)
      : Option.none();

const classContext = (node: ESTree.Node): boolean => {
  const parent = node.parent;
  if (parent === null) return false;
  if (
    parent.type === "JSXAttribute" &&
    parent.name.type === "JSXIdentifier" &&
    Array.contains(["class", "className"], parent.name.name)
  )
    return true;
  if (
    parent.type === "CallExpression" &&
    parent.callee.type === "Identifier" &&
    Array.contains(["cn", "clsx", "cva", "twMerge"], parent.callee.name)
  )
    return true;
  return classContext(parent);
};

// Variant colons inside arbitrary selectors/values do not delimit the utility.
const utility = (text: string): string => {
  const state = Array.reduce(
    Array.fromIterable(text),
    { square: 0, paren: 0, last: -1, index: 0 },
    (previous, character) => ({
      square:
        character === "["
          ? previous.square + 1
          : character === "]"
            ? Math.max(0, previous.square - 1)
            : previous.square,
      paren:
        character === "("
          ? previous.paren + 1
          : character === ")"
            ? Math.max(0, previous.paren - 1)
            : previous.paren,
      last:
        character === ":" && previous.square === 0 && previous.paren === 0
          ? previous.index
          : previous.last,
      index: previous.index + 1,
    }),
  );
  return text
    .slice(state.last + 1)
    .replace(/^!|!$/gu, "")
    .replace(/\/.*$/u, "");
};

const typography = [
  "font-bold",
  "font-medium",
  "font-mono",
  "font-normal",
  "font-sans",
  "font-semibold",
  "leading-none",
  "leading-normal",
  "leading-relaxed",
  "leading-snug",
  "leading-tight",
  "text-2xl",
  "text-3xl",
  "text-4xl",
  "text-base",
  "text-lg",
  "text-md",
  "text-sm",
  "text-xl",
  "text-xs",
  "tracking-display",
  "tracking-loose",
  "tracking-tight",
];

export const typographyRules = {
  "semantic-typography": rule(
    "Use shared semantic typography primitives instead of local text-size, line-height, tracking and font utility piles.",
    (context) => {
      const check = (node: ESTree.Node) => {
        if (
          classContext(node) &&
          stringValue(node).pipe(
            Option.exists((value) =>
              Array.some(value.split(/\s+/u), (word) => Array.contains(typography, utility(word))),
            ),
          )
        )
          report(context, node);
      };
      return { Literal: check, TemplateElement: check };
    },
  ),
  "gap-layout": rule(
    "Use flex/grid gap rather than sibling-margin space-x/space-y utilities.",
    (context) => {
      const check = (node: ESTree.Node) => {
        if (
          classContext(node) &&
          stringValue(node).pipe(
            Option.exists((value) =>
              Array.some(value.split(/\s+/u), (word) => /^space-[xy]-/u.test(utility(word))),
            ),
          )
        )
          report(context, node);
      };
      return { Literal: check, TemplateElement: check };
    },
  ),
  "safe-type-line-height": rule(
    "Use semantic line-height tokens; reject calculated divisions and ratios below one.",
    (context) => {
      const check = (node: ESTree.Node) => {
        if (
          stringValue(node).pipe(
            Option.exists((value) =>
              Array.some(
                Array.fromIterable(
                  value.matchAll(/--text-[a-z0-9-]+--line-height\s*:\s*(?<value>[^;"'`\n}]+)/giu),
                ),
                (match) => {
                  const text = match.groups?.value?.trim() ?? "";
                  const number = Number(text);
                  return (
                    /^calc\([^)]*\/[^)]*\)$/u.test(text) || (Number.isFinite(number) && number < 1)
                  );
                },
              ),
            ),
          )
        )
          report(context, node);
      };
      return { Literal: check, TemplateElement: check };
    },
  ),
};
