import { Array } from "effect";
import { defineRule } from "@oxlint/plugins";
import type { ESTree } from "@oxlint/plugins";

type TypeAssertionExpression = ESTree.TSAsExpression | ESTree.TSTypeAssertion;

function isTypeAssertionExpression(node: ESTree.Node): node is TypeAssertionExpression {
  return node.type === "TSAsExpression" || node.type === "TSTypeAssertion";
}

function unwrapParenthesizedExpression(expression: ESTree.Expression): ESTree.Expression {
  return expression.type === "ParenthesizedExpression"
    ? unwrapParenthesizedExpression(expression.expression)
    : expression;
}

function isConstAssertion(node: TypeAssertionExpression): boolean {
  const { typeAnnotation } = node;
  return (
    typeAnnotation.type === "TSTypeReference" &&
    typeAnnotation.typeName.type === "Identifier" &&
    typeAnnotation.typeName.name === "const"
  );
}

function outsideParentheses(node: ESTree.Expression): ESTree.Expression {
  return node.parent.type === "ParenthesizedExpression" && node.parent.expression === node
    ? outsideParentheses(node.parent)
    : node;
}

function isOutermostAssertionInChain(node: TypeAssertionExpression): boolean {
  const current = outsideParentheses(node);
  return !isTypeAssertionExpression(current.parent) || current.parent.expression !== current;
}

function assertionChain(node: ESTree.Expression): readonly TypeAssertionExpression[] {
  return isTypeAssertionExpression(node)
    ? [node, ...assertionChain(unwrapParenthesizedExpression(node.expression))]
    : [];
}

function isForbiddenAssertionChain(node: TypeAssertionExpression): boolean {
  const chain = assertionChain(node);
  return chain.length > 1 && Array.some(chain, (assertion) => !isConstAssertion(assertion));
}

/** Disallow nested TypeScript type assertions, while permitting chains made only of const assertions. */
export const noChainedTypeAssertionsRule = defineRule({
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow chained TypeScript as and angle-bracket assertions, including parenthesized chains.",
    },
    messages: {
      chained:
        "This assertion chain discards type evidence. Keep the original precise type, or parse untrusted input at its boundary before narrowing it.",
    },
  },
  createOnce(context) {
    const checkTypeAssertion = (node: TypeAssertionExpression) => {
      if (!isOutermostAssertionInChain(node) || !isForbiddenAssertionChain(node)) return;
      context.report({ node, messageId: "chained" });
    };

    return {
      TSAsExpression: checkTypeAssertion,
      TSTypeAssertion: checkTypeAssertion,
    };
  },
});
