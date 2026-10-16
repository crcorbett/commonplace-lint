import { Array, HashMap, Option } from "effect";
import { createTypeEnvironment } from "../shared/dictionary-types.js";
import { defineRule } from "@oxlint/plugins";

import type { ESTree } from "@oxlint/plugins";

function referencedAliasName(type: ESTree.TSType): string | null {
  if (type.type === "TSParenthesizedType") return referencedAliasName(type.typeAnnotation);
  if (type.type !== "TSTypeReference" || type.typeName.type !== "Identifier") return null;
  return type.typeArguments === null ||
    type.typeArguments === undefined ||
    type.typeArguments.params.length === 0
    ? type.typeName.name
    : null;
}

/** Ban named aliases that merely conceal TypeScript's unknown top type. */
export const noUnknownTypeAliasesRule = defineRule({
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow type aliases whose resolved type is unknown; unknown must remain visible at an allowed boundary.",
    },
    messages: {
      unknownAlias:
        "Type alias `{{alias}}` hides `unknown`. Keep `unknown` explicit at the parsing boundary or on an allowed `cause` field; otherwise use the parsed owner type.",
    },
  },
  create(context) {
    const aliases = createTypeEnvironment(context.sourceCode.ast).aliases;

    const resolvesToUnknown = (type: ESTree.TSType, visited: readonly string[] = []): boolean => {
      if (type.type === "TSUnknownKeyword") return true;
      if (type.type === "TSParenthesizedType")
        return resolvesToUnknown(type.typeAnnotation, visited);
      const name = referencedAliasName(type);
      if (name === null || Array.contains(visited, name)) return false;
      const alias = Option.getOrUndefined(HashMap.get(aliases, name));
      if (
        alias === undefined ||
        (alias.typeParameters !== null && alias.typeParameters !== undefined)
      ) {
        return false;
      }
      const nextVisited = [...visited, name];
      return resolvesToUnknown(alias.typeAnnotation, nextVisited);
    };

    return {
      Program() {
        Array.forEach(HashMap.values(aliases), (alias) => {
          if (!resolvesToUnknown(alias.typeAnnotation, [alias.id.name])) return;
          context.report({
            node: alias.id,
            messageId: "unknownAlias",
            data: { alias: alias.id.name },
          });
        });
      },
    };
  },
});
