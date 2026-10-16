import { Array, HashMap, HashSet, Option } from "effect";
import type { ESTree } from "@oxlint/plugins";

const BUILT_INS = HashSet.fromIterable([
  "Record",
  "Readonly",
  "Partial",
  "Required",
  "Pick",
  "Omit",
  "PropertyKey",
  "NonNullable",
]);
const TRANSPARENT_WRAPPERS = HashSet.fromIterable([
  "Readonly",
  "Partial",
  "Required",
  "NonNullable",
]);

type TypeAliasEnvironment = HashMap.HashMap<string, ESTree.TSType>;

type ResolvedType = {
  readonly type: ESTree.TSType;
  readonly substitutions: TypeAliasEnvironment;
};

export type UnsafeDictionary = {
  readonly kind: "unsafe-dictionary";
  readonly unsafeValue: "any" | "empty-object" | "object" | "union" | "unknown";
};

type WideningTargetKind =
  | "anonymous object"
  | "generic container"
  | "object"
  | "open dictionary"
  | "unknown";

export type WideningTarget = {
  readonly kind: WideningTargetKind;
};

export type TypeEnvironment = {
  readonly aliases: HashMap.HashMap<string, ESTree.TSTypeAliasDeclaration>;
  readonly interfaces: HashMap.HashMap<string, readonly ESTree.TSInterfaceDeclaration[]>;
  readonly shadowedBuiltIns: HashSet.HashSet<string>;
};

function declaredStatement(statement: ESTree.Statement): ESTree.Node | null {
  return statement.type === "ExportNamedDeclaration" ||
    statement.type === "ExportDefaultDeclaration"
    ? (statement.declaration ?? null)
    : statement;
}

export function createTypeEnvironment(program: ESTree.Program): TypeEnvironment {
  const empty: TypeEnvironment = {
    aliases: HashMap.empty(),
    interfaces: HashMap.empty(),
    shadowedBuiltIns: HashSet.empty(),
  };
  return Array.reduce(program.body, empty, (environment, statement) => {
    const declaration = declaredStatement(statement);
    if (declaration?.type === "ImportDeclaration") {
      return {
        ...environment,
        shadowedBuiltIns: HashSet.union(
          environment.shadowedBuiltIns,
          HashSet.fromIterable(
            Array.filter(
              Array.map(declaration.specifiers, (specifier) => specifier.local.name),
              (name) => HashSet.has(BUILT_INS, name),
            ),
          ),
        ),
      };
    }
    if (declaration?.type === "TSTypeAliasDeclaration") {
      const name = declaration.id.name;
      const duplicate = HashMap.has(environment.aliases, name);
      return {
        ...environment,
        aliases: duplicate
          ? environment.aliases
          : HashMap.set(environment.aliases, name, declaration),
        shadowedBuiltIns:
          duplicate || HashSet.has(BUILT_INS, name)
            ? HashSet.add(environment.shadowedBuiltIns, name)
            : environment.shadowedBuiltIns,
      };
    }
    if (declaration?.type === "TSInterfaceDeclaration") {
      const name = declaration.id.name;
      const declarations = Option.getOrElse(HashMap.get(environment.interfaces, name), () => []);
      return {
        ...environment,
        interfaces: HashMap.set(environment.interfaces, name, [...declarations, declaration]),
        shadowedBuiltIns: HashSet.has(BUILT_INS, name)
          ? HashSet.add(environment.shadowedBuiltIns, name)
          : environment.shadowedBuiltIns,
      };
    }
    if (
      (declaration?.type === "TSEnumDeclaration" ||
        declaration?.type === "ClassDeclaration" ||
        declaration?.type === "FunctionDeclaration") &&
      declaration.id !== null &&
      HashSet.has(BUILT_INS, declaration.id.name)
    ) {
      return {
        ...environment,
        shadowedBuiltIns: HashSet.add(environment.shadowedBuiltIns, declaration.id.name),
      };
    }
    return environment;
  });
}

function typeReferenceName(type: ESTree.TSTypeReference): string | null {
  return type.typeName.type === "Identifier" ? type.typeName.name : null;
}

function isBuiltIn(name: string, environment: TypeEnvironment): boolean {
  return HashSet.has(BUILT_INS, name) && !HashSet.has(environment.shadowedBuiltIns, name);
}

function isUnappliedReferenceTo(type: ESTree.TSType, name: string): boolean {
  const unwrapped = unwrapTransparentType(type);
  return (
    unwrapped.type === "TSTypeReference" &&
    typeReferenceName(unwrapped) === name &&
    (unwrapped.typeArguments === null ||
      unwrapped.typeArguments === undefined ||
      unwrapped.typeArguments.params.length === 0)
  );
}

function unwrapTransparentType(type: ESTree.TSType): ESTree.TSType {
  const current = type;
  if (
    current.type === "TSParenthesizedType" ||
    (current.type === "TSTypeOperator" && current.operator === "readonly")
  ) {
    return unwrapTransparentType(current.typeAnnotation);
  }
  return current;
}

function isNeverType(type: ESTree.TSType): boolean {
  return unwrapTransparentType(type).type === "TSNeverKeyword";
}

function isEffectivelyEmptyMember(member: ESTree.TSSignature): boolean {
  return (
    member.type === "TSPropertySignature" &&
    member.optional === true &&
    member.typeAnnotation !== null &&
    member.typeAnnotation !== undefined &&
    isNeverType(member.typeAnnotation.typeAnnotation)
  );
}

function isEffectivelyEmptyTypeLiteral(type: ESTree.TSTypeLiteral): boolean {
  return type.members.length === 0 || Array.every(type.members, isEffectivelyEmptyMember);
}

function isEffectivelyEmptyInterface(
  declarations: readonly ESTree.TSInterfaceDeclaration[],
): boolean {
  if (declarations.length !== 1) return false;
  const [type] = declarations;
  return (
    type !== undefined &&
    type.extends.length === 0 &&
    (type.body.body.length === 0 || Array.every(type.body.body, isEffectivelyEmptyMember))
  );
}

function resolvedSubstitutionArgument(
  type: ESTree.TSType,
  base: TypeAliasEnvironment,
  resolving: HashSet.HashSet<string> = HashSet.empty(),
): ESTree.TSType {
  const unwrapped = unwrapTransparentType(type);
  if (unwrapped.type !== "TSTypeReference") return type;
  const name = typeReferenceName(unwrapped);
  if (name === null || HashSet.has(resolving, name)) return type;
  const substitution = Option.getOrUndefined(HashMap.get(base, name));
  if (substitution === undefined) return type;
  const nextResolving = HashSet.add(resolving, name);
  return resolvedSubstitutionArgument(substitution, base, nextResolving);
}

function aliasSubstitution(
  alias: ESTree.TSTypeAliasDeclaration,
  type: ESTree.TSTypeReference,
  base: TypeAliasEnvironment,
): TypeAliasEnvironment | null {
  const parameters = alias.typeParameters?.params ?? [];
  const arguments_ = type.typeArguments?.params ?? [];
  return Option.getOrNull(
    Array.reduce(parameters, Option.some(base), (result, parameter, index) =>
      Option.flatMap(result, (next) =>
        Option.fromNullishOr(
          Option.getOrUndefined(Array.get(arguments_, index)) ?? parameter.default,
        ).pipe(
          Option.map((argument) =>
            HashMap.set(next, parameter.name.name, resolvedSubstitutionArgument(argument, next)),
          ),
        ),
      ),
    ),
  );
}

function unsafeDirectValue(
  type: ESTree.TSType,
  environment: TypeEnvironment,
  substitutions: TypeAliasEnvironment,
  resolvingAliases: HashSet.HashSet<string>,
): UnsafeDictionary["unsafeValue"] | null {
  const unwrapped = unwrapTransparentType(type);
  if (unwrapped.type === "TSUnknownKeyword") return "unknown";
  if (unwrapped.type === "TSAnyKeyword") return "any";
  if (unwrapped.type === "TSObjectKeyword") return "object";
  if (unwrapped.type === "TSTypeLiteral" && isEffectivelyEmptyTypeLiteral(unwrapped))
    return "empty-object";
  if (unwrapped.type === "TSUnionType") {
    return Array.some(
      unwrapped.types,
      (member) => unsafeDirectValue(member, environment, substitutions, resolvingAliases) !== null,
    )
      ? "union"
      : null;
  }
  if (unwrapped.type === "TSIntersectionType") {
    const unsafeMembers = Array.map(unwrapped.types, (member) =>
      unsafeDirectValue(member, environment, substitutions, resolvingAliases),
    );
    if (Array.contains(unsafeMembers, "any")) return "any";
    return unsafeMembers.length > 0 && Array.every(unsafeMembers, (member) => member !== null)
      ? (Option.getOrUndefined(Array.head(unsafeMembers)) ?? null)
      : null;
  }
  if (unwrapped.type !== "TSTypeReference") return null;
  const name = typeReferenceName(unwrapped);
  if (name === null) return null;
  if (HashSet.has(TRANSPARENT_WRAPPERS, name) && isBuiltIn(name, environment)) {
    const wrapped = Option.getOrUndefined(Array.head(unwrapped.typeArguments?.params ?? []));
    return wrapped === undefined
      ? null
      : unsafeDirectValue(wrapped, environment, substitutions, resolvingAliases);
  }
  const substitution = Option.getOrUndefined(HashMap.get(substitutions, name));
  if (substitution !== undefined) {
    return isUnappliedReferenceTo(substitution, name)
      ? null
      : unsafeDirectValue(substitution, environment, substitutions, resolvingAliases);
  }
  const interfaceDeclarations = Option.getOrUndefined(HashMap.get(environment.interfaces, name));
  if (interfaceDeclarations !== undefined) {
    return isEffectivelyEmptyInterface(interfaceDeclarations) ? "empty-object" : null;
  }
  const alias = Option.getOrUndefined(HashMap.get(environment.aliases, name));
  if (alias === undefined || HashSet.has(resolvingAliases, name)) return null;
  const nextSubstitutions = aliasSubstitution(alias, unwrapped, substitutions);
  if (nextSubstitutions === null) return null;
  const nextResolving = HashSet.add(resolvingAliases, name);
  return unsafeDirectValue(alias.typeAnnotation, environment, nextSubstitutions, nextResolving);
}

function dictionaryValueTypes(
  type: ESTree.TSType,
  environment: TypeEnvironment,
  substitutions: TypeAliasEnvironment,
  resolvingAliases: HashSet.HashSet<string>,
): readonly ResolvedType[] {
  const unwrapped = unwrapTransparentType(type);

  if (unwrapped.type === "TSTypeLiteral") {
    return Array.flatMap(unwrapped.members, (member): readonly ResolvedType[] =>
      member.type === "TSIndexSignature" && member.typeAnnotation !== null
        ? [{ type: member.typeAnnotation.typeAnnotation, substitutions }]
        : [],
    );
  }

  if (unwrapped.type === "TSMappedType") {
    return unwrapped.typeAnnotation === null
      ? []
      : [{ type: unwrapped.typeAnnotation, substitutions }];
  }

  if (unwrapped.type !== "TSTypeReference") return [];
  const name = typeReferenceName(unwrapped);
  if (name === null) return [];

  const substitution = Option.getOrUndefined(HashMap.get(substitutions, name));
  if (substitution !== undefined) {
    return isUnappliedReferenceTo(substitution, name)
      ? []
      : dictionaryValueTypes(substitution, environment, substitutions, resolvingAliases);
  }

  if (HashSet.has(TRANSPARENT_WRAPPERS, name) && isBuiltIn(name, environment)) {
    const wrapped = Option.getOrUndefined(Array.head(unwrapped.typeArguments?.params ?? []));
    return wrapped === undefined
      ? []
      : dictionaryValueTypes(wrapped, environment, substitutions, resolvingAliases);
  }

  if (name === "Record" && isBuiltIn(name, environment)) {
    const value =
      Option.getOrUndefined(Array.get(unwrapped.typeArguments?.params ?? [], 1)) ?? null;
    return value === null ? [] : [{ type: value, substitutions }];
  }

  if ((name === "Pick" || name === "Omit") && isBuiltIn(name, environment)) {
    const source = Option.getOrUndefined(Array.head(unwrapped.typeArguments?.params ?? []));
    return source === undefined
      ? []
      : dictionaryValueTypes(source, environment, substitutions, resolvingAliases);
  }

  const alias = Option.getOrUndefined(HashMap.get(environment.aliases, name));
  if (alias === undefined || HashSet.has(resolvingAliases, name)) return [];
  const nextSubstitutions = aliasSubstitution(alias, unwrapped, substitutions);
  if (nextSubstitutions === null) return [];
  const nextResolving = HashSet.add(resolvingAliases, name);
  return dictionaryValueTypes(alias.typeAnnotation, environment, nextSubstitutions, nextResolving);
}

export function classifyUnsafeDictionaryValue(
  valueType: ESTree.TSType,
  environment: TypeEnvironment,
): UnsafeDictionary | null {
  const unsafeValue = unsafeDirectValue(valueType, environment, HashMap.empty(), HashSet.empty());
  return unsafeValue === null ? null : { kind: "unsafe-dictionary", unsafeValue };
}

export function classifyUnsafeDictionary(
  type: ESTree.TSType,
  environment: TypeEnvironment,
): UnsafeDictionary | null {
  return Option.getOrNull(
    Array.findFirst(
      Array.map(
        dictionaryValueTypes(type, environment, HashMap.empty(), HashSet.empty()),
        (valueType) =>
          Option.map(
            Option.fromNullishOr(
              unsafeDirectValue(
                valueType.type,
                environment,
                valueType.substitutions,
                HashSet.empty(),
              ),
            ),
            (unsafeValue): UnsafeDictionary => ({ kind: "unsafe-dictionary", unsafeValue }),
          ),
      ),
      Option.isSome,
    ).pipe(Option.flatten),
  );
}

function resolvesToDictionary(
  type: ESTree.TSType,
  environment: TypeEnvironment,
  substitutions: TypeAliasEnvironment,
  resolvingAliases: HashSet.HashSet<string>,
): boolean {
  return dictionaryValueTypes(type, environment, substitutions, resolvingAliases).length > 0;
}

export function classifyWideningTarget(
  type: ESTree.TSType,
  environment: TypeEnvironment,
): WideningTarget | null {
  const unwrapped = unwrapTransparentType(type);
  if (unwrapped.type === "TSUnknownKeyword") return { kind: "unknown" };
  if (unwrapped.type === "TSObjectKeyword") return { kind: "object" };
  if (unwrapped.type === "TSTypeLiteral") {
    return Array.some(unwrapped.members, (member) => member.type === "TSIndexSignature")
      ? { kind: "open dictionary" }
      : unwrapped.members.length > 0
        ? { kind: "anonymous object" }
        : null;
  }
  if (unwrapped.type === "TSMappedType") return { kind: "open dictionary" };
  if (unwrapped.type !== "TSTypeReference") return null;
  const name = typeReferenceName(unwrapped);
  if (name === null) return null;
  if (HashSet.has(TRANSPARENT_WRAPPERS, name) && isBuiltIn(name, environment)) {
    const wrapped = Option.getOrUndefined(Array.head(unwrapped.typeArguments?.params ?? []));
    return wrapped === undefined ? null : classifyWideningTarget(wrapped, environment);
  }
  if (name === "Record" && isBuiltIn(name, environment)) return { kind: "open dictionary" };
  const alias = Option.getOrUndefined(HashMap.get(environment.aliases, name));
  if (alias === undefined) return null;
  if ((alias.typeParameters?.params.length ?? 0) > 0) {
    const substitutions = aliasSubstitution(alias, unwrapped, HashMap.empty());
    return substitutions !== null &&
      resolvesToDictionary(
        alias.typeAnnotation,
        environment,
        substitutions,
        HashSet.fromIterable([name]),
      )
      ? { kind: "generic container" }
      : null;
  }
  const substitutions = aliasSubstitution(alias, unwrapped, HashMap.empty());
  if (substitutions === null) return null;
  const resolved = classifyAliasBroadTarget(
    alias.typeAnnotation,
    environment,
    substitutions,
    HashSet.fromIterable([name]),
  );
  return resolved;
}

function isBroadMappedKey(
  type: ESTree.TSType,
  environment: TypeEnvironment,
  substitutions: TypeAliasEnvironment,
): boolean {
  const unwrapped = unwrapTransparentType(type);
  if (
    unwrapped.type === "TSStringKeyword" ||
    unwrapped.type === "TSNumberKeyword" ||
    unwrapped.type === "TSSymbolKeyword"
  ) {
    return true;
  }
  if (unwrapped.type === "TSUnionType") {
    return Array.every(unwrapped.types, (member) =>
      isBroadMappedKey(member, environment, substitutions),
    );
  }
  if (unwrapped.type !== "TSTypeReference") return false;
  const name = typeReferenceName(unwrapped);
  if (name === null) return false;
  const substitution = Option.getOrUndefined(HashMap.get(substitutions, name));
  if (substitution !== undefined && !isUnappliedReferenceTo(substitution, name)) {
    return isBroadMappedKey(substitution, environment, substitutions);
  }
  return name === "PropertyKey" && isBuiltIn(name, environment);
}

function classifyAliasBroadTarget(
  type: ESTree.TSType,
  environment: TypeEnvironment,
  substitutions: TypeAliasEnvironment,
  resolvingAliases: HashSet.HashSet<string>,
): WideningTarget | null {
  const unwrapped = unwrapTransparentType(type);
  if (unwrapped.type === "TSUnknownKeyword") return { kind: "unknown" };
  if (unwrapped.type === "TSObjectKeyword") return { kind: "object" };
  if (unwrapped.type === "TSTypeLiteral") {
    return Array.some(unwrapped.members, (member) => member.type === "TSIndexSignature")
      ? { kind: "open dictionary" }
      : null;
  }
  if (unwrapped.type === "TSMappedType") {
    return isBroadMappedKey(unwrapped.constraint, environment, substitutions)
      ? { kind: "open dictionary" }
      : null;
  }
  if (unwrapped.type !== "TSTypeReference") return null;
  const name = typeReferenceName(unwrapped);
  if (name === null) return null;
  const substitution = Option.getOrUndefined(HashMap.get(substitutions, name));
  if (substitution !== undefined) {
    return isUnappliedReferenceTo(substitution, name)
      ? null
      : classifyAliasBroadTarget(substitution, environment, substitutions, resolvingAliases);
  }
  if (HashSet.has(TRANSPARENT_WRAPPERS, name) && isBuiltIn(name, environment)) {
    const wrapped = Option.getOrUndefined(Array.head(unwrapped.typeArguments?.params ?? []));
    return wrapped === undefined
      ? null
      : classifyAliasBroadTarget(wrapped, environment, substitutions, resolvingAliases);
  }
  if (name === "Record" && isBuiltIn(name, environment)) {
    return { kind: "open dictionary" };
  }
  const alias = Option.getOrUndefined(HashMap.get(environment.aliases, name));
  if (alias === undefined || HashSet.has(resolvingAliases, name)) return null;
  const nextSubstitutions = aliasSubstitution(alias, unwrapped, substitutions);
  if (nextSubstitutions === null) return null;
  const nextResolving = HashSet.add(resolvingAliases, name);
  return classifyAliasBroadTarget(
    alias.typeAnnotation,
    environment,
    nextSubstitutions,
    nextResolving,
  );
}

export function isKnownEvidenceExpression(expression: ESTree.Expression): boolean {
  const current = expression;
  if (
    current.type === "ParenthesizedExpression" ||
    current.type === "TSAsExpression" ||
    current.type === "TSTypeAssertion" ||
    current.type === "TSNonNullExpression" ||
    current.type === "TSSatisfiesExpression"
  ) {
    return isKnownEvidenceExpression(current.expression);
  }
  if (current.type === "ObjectExpression") return true;
  return (
    current.type === "ArrayExpression" ||
    current.type === "ArrowFunctionExpression" ||
    current.type === "ClassExpression" ||
    current.type === "FunctionExpression" ||
    current.type === "NewExpression" ||
    current.type === "Literal" ||
    current.type === "TemplateLiteral" ||
    current.type === "UnaryExpression"
  );
}
