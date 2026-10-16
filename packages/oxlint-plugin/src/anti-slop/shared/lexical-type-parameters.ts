import type { Context, ESTree } from "@oxlint/plugins";
import { Array } from "effect";
import { childNodes } from "../../syntax.js";

const inferNames = (context: Context, node: ESTree.Node): readonly string[] => [
  ...(node.type === "TSInferType" ? [node.typeParameter.name.name] : []),
  ...Array.flatMap(childNodes(context, node), (child) => inferNames(context, child)),
];

const namesAt = (
  context: Context,
  current: ESTree.Node | null,
  descendant: ESTree.Node,
): readonly string[] => {
  if (current === null || current.type === "Program") return [];
  return [
    ...("typeParameters" in current
      ? Array.map(current.typeParameters?.params ?? [], (parameter) => parameter.name.name)
      : []),
    ...(current.type === "TSMappedType" &&
    (descendant === current.nameType || descendant === current.typeAnnotation)
      ? [current.key.name]
      : []),
    ...(current.type === "TSConditionalType" && descendant === current.trueType
      ? inferNames(context, current.extendsType)
      : []),
    ...namesAt(context, current.parent, current),
  ];
};

/** Type binders in scope at a node, including mapped and inferred parameters. */
export const lexicalTypeParameterNames = (node: ESTree.Node, context: Context): readonly string[] =>
  namesAt(context, node, node);
