import { Array, Option } from "effect";
import { defineRule } from "@oxlint/plugins";
import type { ESTree, Variable } from "@oxlint/plugins";

type BroadTypeKind = "top" | "object" | "record";

type KnownValueEvidence = {
  readonly type: ESTree.TSType | null;
};

const functionBoundaryTypes = [
  "ArrowFunctionExpression",
  "FunctionDeclaration",
  "FunctionExpression",
  "TSDeclareFunction",
  "TSEmptyBodyFunctionExpression",
];

function unwrapExpressionParentheses(expression: ESTree.Expression): ESTree.Expression {
  return expression.type === "ParenthesizedExpression"
    ? unwrapExpressionParentheses(expression.expression)
    : expression;
}

function unwrapTypeParentheses(type: ESTree.TSType): ESTree.TSType {
  return type.type === "TSParenthesizedType" ? unwrapTypeParentheses(type.typeAnnotation) : type;
}

function typeReferenceName(type: ESTree.TSTypeReference): string | null {
  return type.typeName.type === "Identifier" ? type.typeName.name : null;
}

function isUnknownOrAnyType(type: ESTree.TSType): boolean {
  const unwrapped = unwrapTypeParentheses(type);
  return unwrapped.type === "TSUnknownKeyword" || unwrapped.type === "TSAnyKeyword";
}

function isBroadRecordKeyType(type: ESTree.TSType): boolean {
  const unwrapped = unwrapTypeParentheses(type);
  if (
    unwrapped.type === "TSStringKeyword" ||
    unwrapped.type === "TSNumberKeyword" ||
    unwrapped.type === "TSSymbolKeyword"
  ) {
    return true;
  }
  if (unwrapped.type === "TSUnionType") return Array.every(unwrapped.types, isBroadRecordKeyType);
  return unwrapped.type === "TSTypeReference" && typeReferenceName(unwrapped) === "PropertyKey";
}

function isBroadRecordType(type: ESTree.TSType): boolean {
  const unwrapped = unwrapTypeParentheses(type);

  if (unwrapped.type === "TSTypeReference") {
    if (typeReferenceName(unwrapped) === "Readonly") {
      const [inner] = unwrapped.typeArguments?.params ?? [];
      return inner !== undefined && isBroadRecordType(inner);
    }

    if (typeReferenceName(unwrapped) !== "Record") return false;
    const parameters = unwrapped.typeArguments?.params ?? [];
    const [key, value] = parameters;
    return (
      parameters.length === 2 &&
      key !== undefined &&
      value !== undefined &&
      isBroadRecordKeyType(key) &&
      isUnknownOrAnyType(value)
    );
  }

  if (unwrapped.type !== "TSTypeLiteral" || unwrapped.members.length !== 1) return false;
  const [member] = unwrapped.members;
  const [parameter] = member?.type === "TSIndexSignature" ? member.parameters : [];
  return (
    member?.type === "TSIndexSignature" &&
    member.parameters.length === 1 &&
    parameter !== undefined &&
    isBroadRecordKeyType(parameter.typeAnnotation.typeAnnotation) &&
    isUnknownOrAnyType(member.typeAnnotation.typeAnnotation)
  );
}

function broadTypeKind(type: ESTree.TSType): BroadTypeKind | null {
  const unwrapped = unwrapTypeParentheses(type);
  if (unwrapped.type === "TSUnknownKeyword" || unwrapped.type === "TSAnyKeyword") return "top";
  if (unwrapped.type === "TSObjectKeyword") return "object";
  return isBroadRecordType(unwrapped) ? "record" : null;
}

function assertedExpression(
  node: ESTree.TSAsExpression | ESTree.TSTypeAssertion,
): ESTree.Expression {
  return unwrapExpressionParentheses(node.expression);
}

function assertionFromExpression(
  expression: ESTree.Expression,
): ESTree.TSAsExpression | ESTree.TSTypeAssertion | null {
  const unwrapped = unwrapExpressionParentheses(expression);
  return unwrapped.type === "TSAsExpression" || unwrapped.type === "TSTypeAssertion"
    ? unwrapped
    : null;
}

function normalizedTypeText(sourceText: string, type: ESTree.TSType): string {
  return sourceText.slice(type.start, type.end).replaceAll(/\s+/gu, "");
}

function typesHaveSameSyntax(
  sourceText: string,
  left: ESTree.TSType | null,
  right: ESTree.TSType,
): boolean {
  return (
    left !== null &&
    normalizedTypeText(sourceText, unwrapTypeParentheses(left)) ===
      normalizedTypeText(sourceText, unwrapTypeParentheses(right))
  );
}

function isDefinitelyObjectType(type: ESTree.TSType): boolean {
  const unwrapped = unwrapTypeParentheses(type);
  if (
    Array.contains(
      [
        "TSArrayType",
        "TSConstructorType",
        "TSFunctionType",
        "TSMappedType",
        "TSObjectKeyword",
        "TSTupleType",
      ],
      unwrapped.type,
    )
  )
    return true;
  if (unwrapped.type === "TSTypeLiteral") return unwrapped.members.length > 0;
  if (unwrapped.type === "TSIntersectionType")
    return Array.every(unwrapped.types, isDefinitelyObjectType);
  return (
    unwrapped.type === "TSTypeOperator" &&
    unwrapped.operator === "readonly" &&
    isDefinitelyObjectType(unwrapped.typeAnnotation)
  );
}

function isDefinitelyNarrowerRecordType(type: ESTree.TSType): boolean {
  const unwrapped = unwrapTypeParentheses(type);
  if (unwrapped.type === "TSTypeLiteral") {
    return Array.some(unwrapped.members, (member) => member.type !== "TSIndexSignature");
  }

  if (unwrapped.type !== "TSTypeReference") return false;
  if (typeReferenceName(unwrapped) === "Readonly") {
    const [inner] = unwrapped.typeArguments?.params ?? [];
    return inner !== undefined && isDefinitelyNarrowerRecordType(inner);
  }
  if (typeReferenceName(unwrapped) !== "Record") return false;

  const parameters = unwrapped.typeArguments?.params ?? [];
  const [, value] = parameters;
  return parameters.length === 2 && value !== undefined && !isUnknownOrAnyType(value);
}

function functionBoundary(node: ESTree.Node): ESTree.Node | null {
  const current = node.parent;
  if (current === null || current.type === "Program") return null;
  return Array.contains(functionBoundaryTypes, current.type) ? current : functionBoundary(current);
}

function resolvedVariableForIdentifier(
  scopes: readonly {
    readonly references: readonly {
      readonly identifier: ESTree.Node;
      readonly resolved: Variable | null;
    }[];
  }[],
  identifier: ESTree.IdentifierReference,
): Variable | null {
  return Option.getOrNull(
    Array.findFirst(scopes, (scope) =>
      Array.some(
        scope.references,
        (candidate) =>
          candidate.identifier.start === identifier.start &&
          candidate.identifier.end === identifier.end,
      ),
    ).pipe(
      Option.flatMap((scope) =>
        Array.findFirst(
          scope.references,
          (candidate) =>
            candidate.identifier.start === identifier.start &&
            candidate.identifier.end === identifier.end,
        ),
      ),
      Option.flatMap((reference) => Option.fromNullishOr(reference.resolved)),
    ),
  );
}

function variableDeclarator(variable: Variable): ESTree.VariableDeclarator | null {
  return Option.getOrNull(
    Array.findFirst(
      variable.defs,
      (definition) =>
        definition.type === "Variable" && definition.node.type === "VariableDeclarator",
    ).pipe(
      Option.flatMap((definition) =>
        definition.node.type === "VariableDeclarator"
          ? Option.some(definition.node)
          : Option.none(),
      ),
    ),
  );
}

function knownValueEvidence(
  expression: ESTree.Expression,
  scopes: Parameters<typeof resolvedVariableForIdentifier>[0],
  boundary: ESTree.Node | null,
  visitedVariables: readonly Variable[],
): KnownValueEvidence | null {
  const unwrapped = unwrapExpressionParentheses(expression);

  if (unwrapped.type === "TSAsExpression" || unwrapped.type === "TSTypeAssertion") {
    if (broadTypeKind(unwrapped.typeAnnotation) !== null) return null;
    return { type: unwrapped.typeAnnotation };
  }

  if (unwrapped.type === "Literal" || unwrapped.type === "TemplateLiteral") {
    return { type: null };
  }

  if (
    unwrapped.type === "ArrayExpression" ||
    unwrapped.type === "ArrowFunctionExpression" ||
    unwrapped.type === "ClassExpression" ||
    unwrapped.type === "FunctionExpression" ||
    unwrapped.type === "NewExpression" ||
    unwrapped.type === "ObjectExpression"
  ) {
    return { type: null };
  }

  if (unwrapped.type !== "Identifier") return null;
  const variable = resolvedVariableForIdentifier(scopes, unwrapped);
  if (variable === null || Array.some(visitedVariables, (previous) => previous === variable))
    return null;

  const annotatedIdentifier = Option.getOrUndefined(
    Array.findFirst(
      variable.identifiers,
      (identifier) => identifier.typeAnnotation !== null && identifier.typeAnnotation !== undefined,
    ),
  );
  const annotation = annotatedIdentifier?.typeAnnotation?.typeAnnotation;
  if (annotation !== undefined && annotatedIdentifier !== undefined) {
    if (functionBoundary(annotatedIdentifier) !== boundary || broadTypeKind(annotation) !== null) {
      return null;
    }
    return { type: annotation };
  }

  const declarator = variableDeclarator(variable);
  if (
    declarator === null ||
    declarator.parent.type !== "VariableDeclaration" ||
    declarator.parent.kind !== "const" ||
    declarator.init === null ||
    Array.some(variable.references, (reference) => reference.isWrite() && !reference.init) ||
    functionBoundary(declarator) !== boundary
  ) {
    return null;
  }

  return knownValueEvidence(declarator.init, scopes, boundary, [...visitedVariables, variable]);
}

function widenedBinding(
  variable: Variable,
  scopes: Parameters<typeof resolvedVariableForIdentifier>[0],
): {
  readonly broadKind: BroadTypeKind;
  readonly evidence: KnownValueEvidence;
  readonly declaredAt: number;
  readonly boundary: ESTree.Node | null;
} | null {
  const declarator = variableDeclarator(variable);
  if (
    declarator === null ||
    declarator.parent.type !== "VariableDeclaration" ||
    declarator.parent.kind !== "const" ||
    declarator.id.type !== "Identifier" ||
    declarator.init === null ||
    Array.some(variable.references, (reference) => reference.isWrite() && !reference.init)
  ) {
    return null;
  }

  const boundary = functionBoundary(declarator);
  const declaredType = declarator.id.typeAnnotation?.typeAnnotation;
  const initializerAssertion = assertionFromExpression(declarator.init);
  const initializerBroadKind =
    initializerAssertion === null ? null : broadTypeKind(initializerAssertion.typeAnnotation);
  const declaredBroadKind = declaredType === undefined ? null : broadTypeKind(declaredType);
  const broadKind = declaredBroadKind ?? initializerBroadKind;
  if (broadKind === null) return null;

  const originalExpression =
    initializerAssertion !== null && initializerBroadKind !== null
      ? assertedExpression(initializerAssertion)
      : declarator.init;
  const evidence = knownValueEvidence(originalExpression, scopes, boundary, [variable]);
  return evidence === null ? null : { broadKind, evidence, declaredAt: declarator.end, boundary };
}

function assertionIsNarrower(
  sourceText: string,
  broadKind: BroadTypeKind,
  evidence: KnownValueEvidence,
  assertedType: ESTree.TSType,
): boolean {
  if (broadTypeKind(assertedType) !== null) return false;
  if (broadKind === "top") return true;
  if (typesHaveSameSyntax(sourceText, evidence.type, assertedType)) return true;
  if (broadKind === "object") return isDefinitelyObjectType(assertedType);
  return isDefinitelyNarrowerRecordType(assertedType);
}

/** Detect immutable local bindings that erase a known type and are later asserted back to a narrower type. */
export const noWidenThenAssertRule = defineRule({
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow local const flows that explicitly widen a known value before asserting the widened binding to a narrower type.",
    },
    messages: {
      widenThenAssert:
        'Binding "{{name}}" discards type evidence and later recreates it with an assertion. Keep the precise type from initialization through use; parse boundary input once.',
    },
  },
  create(context) {
    const scopes = context.sourceCode.scopeManager.scopes;

    const checkAssertion = (node: ESTree.TSAsExpression | ESTree.TSTypeAssertion) => {
      const expression = assertedExpression(node);
      if (expression.type !== "Identifier") return;

      const variable = resolvedVariableForIdentifier(scopes, expression);
      if (variable === null) return;
      const widened = widenedBinding(variable, scopes);
      if (
        widened === null ||
        node.start <= widened.declaredAt ||
        functionBoundary(node) !== widened.boundary ||
        !assertionIsNarrower(
          context.sourceCode.text,
          widened.broadKind,
          widened.evidence,
          node.typeAnnotation,
        )
      ) {
        return;
      }

      context.report({
        node,
        messageId: "widenThenAssert",
        data: { name: expression.name },
      });
    };

    return {
      TSAsExpression: checkAssertion,
      TSTypeAssertion: checkAssertion,
    };
  },
});
