import { Array, Number, Option, Order, Predicate, Record, Schema } from "effect";

/** The consumer manifest fields the doctor reads. */
export const Manifest = Schema.Struct({
  scripts: Schema.optionalKey(Schema.Record(Schema.String, Schema.String)),
  dependencies: Schema.optionalKey(Schema.Record(Schema.String, Schema.String)),
  devDependencies: Schema.optionalKey(Schema.Record(Schema.String, Schema.String)),
});
type Manifest = typeof Manifest.Type;

const Rules = Schema.Record(Schema.String, Schema.Json);
const jsonList = Schema.is(Schema.Array(Schema.Json));
interface Config {
  readonly rules?: Readonly<Record<string, Schema.Json>>;
  readonly overrides?: ReadonlyArray<{ readonly rules?: Readonly<Record<string, Schema.Json>> }>;
  readonly extends?: ReadonlyArray<Config | string>;
}
/** An Oxlint configuration object, including configurations it extends. */
export const Config: Schema.Codec<Config> = Schema.Struct({
  rules: Schema.optionalKey(Rules),
  overrides: Schema.optionalKey(Schema.Array(Schema.Struct({ rules: Schema.optionalKey(Rules) }))),
  extends: Schema.optionalKey(
    Schema.Array(Schema.Union([Schema.String, Schema.suspend((): Schema.Codec<Config> => Config)])),
  ),
});

/** Extended configuration files named by path, which the host loads relative to their parent. */
export const extendedFiles = (config: Config): readonly string[] =>
  Array.flatMap(config.extends ?? [], (entry) =>
    Predicate.isString(entry) ? [entry] : extendedFiles(entry),
  );

export interface Finding {
  readonly severity: "error" | "warning";
  readonly check: "version" | "refresh" | "duplicate" | "path" | "config";
  readonly message: string;
}

const packageName = "@commonplaces/oxlint-plugin";

/** (a) Commonplace consumers track the latest release and refresh it before lint. */
export const versionFindings = (manifest: Manifest): readonly Finding[] => {
  const declared = Record.get(manifest.devDependencies ?? {}, packageName).pipe(
    Option.orElse(() => Record.get(manifest.dependencies ?? {}, packageName)),
  );
  return Option.match(declared, {
    onNone: () => [
      { severity: "error", check: "version", message: `${packageName} is not a dependency.` },
    ],
    onSome: (version) =>
      version === "latest"
        ? []
        : [
            {
              severity: "error",
              check: "version",
              message: `${packageName} is "${version}". Declare "latest" and refresh it before lint.`,
            },
          ],
  });
};

const reference = /(?:^|[\s;&|(])(?:bun|npm|pnpm|yarn)(?:\s+run)?\s+([\w:.-]+)(?=$|[\s;&|)])/gu;
const oxlintCommand = /(?:^|[\s;&|(])(?:(?:npx|bunx|pnpm exec|yarn)\s+)?oxlint(?=\s|$)/u;
const refreshCommand = (command: string) =>
  command.includes(packageName) &&
  /\b(?:update|upgrade|add|install|i|up)\b/u.test(command) &&
  /(?:--latest|@latest)\b/u.test(command);

// Inline `run` references to other scripts, with a pre-script first. A
// repeated name stops a cycle; unknown names stay as written.
const expand = (
  scripts: Readonly<Record<string, string>>,
  name: string,
  seen: readonly string[],
): string => {
  if (Array.contains(seen, name)) return "";
  const next = [...seen, name];
  const own = Option.getOrElse(Record.get(scripts, name), () => "");
  const pre = Record.has(scripts, `pre${name}`) ? `${expand(scripts, `pre${name}`, next)} && ` : "";
  return (
    pre +
    own.replaceAll(reference, (whole, target: string) =>
      Record.has(scripts, target) ? ` ${expand(scripts, target, next)} ` : whole,
    )
  );
};

export const refreshFindings = (manifest: Manifest): readonly Finding[] => {
  const scripts = manifest.scripts ?? {};
  if (!Record.has(scripts, "lint"))
    return [{ severity: "error", check: "refresh", message: "There is no lint script." }];
  const steps = expand(scripts, "lint", []).split(/&&|\|\||;/u);
  const firstLint = Array.findFirstIndex(steps, (step) => oxlintCommand.test(step));
  const firstRefresh = Array.findFirstIndex(steps, refreshCommand);
  return Option.match(firstLint, {
    onNone: () => [
      {
        severity: "warning",
        check: "refresh",
        message:
          "The lint script does not visibly run oxlint, so its refresh order was not checked.",
      },
    ],
    onSome: (lint) =>
      Option.exists(firstRefresh, (refresh) => refresh < lint)
        ? []
        : [
            {
              severity: "error",
              check: "refresh",
              message: `No ${packageName} refresh (for example "lint:refresh": "bun update ${packageName} --latest") runs before oxlint in the lint script.`,
            },
          ],
  });
};

const builtinPlugins: ReadonlyArray<string> = [
  "eslint",
  "typescript",
  "unicorn",
  "oxc",
  "import",
  "react",
  "react-perf",
  "jsx-a11y",
  "nextjs",
  "jsdoc",
  "jest",
  "vitest",
  "promise",
  "node",
  "vue",
  "regexp",
  "effecttsgo",
];

/**
 * Local rule names known to repeat a preset rule's meaning. Add an entry when a
 * consumer review finds another copied rule; the preset rule stays the owner.
 */
const knownDuplicates: Readonly<Record<string, string>> = {
  "no-instanceof": "effect/no-instanceof",
  "no-manual-tag": "effect/no-manual-tag",
  "no-console-outside-runtime": "effect/no-console",
  "no-raw-fetch": "effect/no-raw-fetch",
  "no-fetch": "effect/no-raw-fetch",
  "no-process-env": "effect/no-ambient-process",
  "no-process-outside-boundaries": "effect/no-ambient-process",
  "no-async-await": "effect/no-async-await-promise",
  "no-runtime-execution-outside-boundaries": "effect/no-runtime-execution-outside-main",
  "no-runtime-references-outside-boundaries": "strict-effect/no-runtime-outside-boundary",
  "no-json-parse": "strict-effect/no-unchecked-json",
  "no-promise": "strict-effect/no-promise-workflow",
  "no-option-get-or-throw": "strict-effect/no-unsafe-option-unwrap",
  "no-layer-factories": "strict-effect/static-layers",
  "no-atom-factories": "strict-effect/static-atoms",
  "no-bare-effect-try-promise": "effect-conventions/require-try-promise-catch",
  "no-effect-test-global-mix": "effect-conventions/no-mixed-test-globals",
  "no-host-imports-in-contracts": "effect-conventions/no-host-api-in-contract",
  "no-layer-exports-in-service-files": "effect-conventions/no-layer-export-in-service",
  "no-throwing-schema-sync-codec": "effect-conventions/no-throwing-schema-codec",
  "no-unknown-tagged-error-cause": "effect-conventions/no-unknown-tagged-error-payload",
  "no-decoding-outside-boundaries": "effect-conventions/no-schema-decoder-outside-ingress",
  "no-bun-globals": "bun/no-ambient-host-api",
  "no-cross-workspace-imports": "package/no-cross-package-source-imports",
  "no-module-mocks": "anti-slop/no-module-mocking",
  "no-hex-colours": "web/no-colour-literals",
};

const disabled = (setting: Schema.Json): boolean => {
  const level = jsonList(setting) ? Option.getOrUndefined(Array.head(setting)) : setting;
  return level === "off" || level === "allow" || level === 0;
};

const ruleEntries = (configs: readonly Config[]): ReadonlyArray<readonly [string, Schema.Json]> =>
  Array.flatMap(configs, (config) => [
    ...Record.toEntries(config.rules ?? {}),
    ...Array.flatMap(config.overrides ?? [], (override) => Record.toEntries(override.rules ?? {})),
    ...ruleEntries(
      Array.flatMap(config.extends ?? [], (entry) => (Predicate.isString(entry) ? [] : [entry])),
    ),
  ]);

const stopWords: ReadonlyArray<string> = [
  "no",
  "outside",
  "in",
  "of",
  "the",
  "a",
  "an",
  "require",
  "boundary",
  "boundaries",
  "file",
  "files",
  "only",
];
const tokens = (name: string): readonly string[] =>
  Array.dedupe(
    Array.map(
      Array.filter(name.split("-"), (word) => word.length > 0 && !Array.contains(stopWords, word)),
      (word) => (word.length > 3 && word.endsWith("s") ? word.slice(0, -1) : word),
    ),
  );
const similarity = (left: string, right: string): number => {
  const a = tokens(left);
  const b = tokens(right);
  const shared = Array.filter(a, (word) => Array.contains(b, word)).length;
  const total = Array.dedupe([...a, ...b]).length;
  return total === 0 ? 0 : shared / total;
};

/** (b) Enabled local rules that repeat a preset rule by name, known meaning or close name. */
export const duplicateFindings = (
  configs: readonly Config[],
  presetRules: readonly string[],
): readonly Finding[] => {
  const presetPlugins = Array.dedupe(Array.map(presetRules, (id) => id.slice(0, id.indexOf("/"))));
  const local = Array.dedupe(
    Array.flatMap(ruleEntries(configs), ([id, setting]) => {
      const slash = id.indexOf("/");
      const plugin = id.slice(0, slash);
      return slash > 0 &&
        !disabled(setting) &&
        !Array.contains(builtinPlugins, plugin) &&
        !Array.contains(presetPlugins, plugin)
        ? [id]
        : [];
    }),
  );
  return Array.flatMap(local, (id): readonly Finding[] => {
    const name = id.slice(id.indexOf("/") + 1);
    const exact = Array.findFirst(presetRules, (preset) => preset.endsWith(`/${name}`));
    const known = Record.get(knownDuplicates, name).pipe(
      Option.filter((preset) => Array.contains(presetRules, preset)),
    );
    return Option.match(
      Option.orElse(exact, () => known),
      {
        onSome: (preset) => [
          {
            severity: "error",
            check: "duplicate",
            message: `${id} repeats ${preset}. Remove the local rule and configure the preset rule instead.`,
          },
        ],
        onNone: () =>
          Array.head(
            Array.sort(
              Array.filter(
                Array.map(presetRules, (preset) => ({
                  preset,
                  score: similarity(name, preset.slice(preset.indexOf("/") + 1)),
                })),
                ({ score }) => score >= 0.5,
              ),
              Order.mapInput(
                Order.flip(Number.Order),
                ({ score }: { readonly score: number }) => score,
              ),
            ),
          ).pipe(
            Option.match({
              onNone: () => [],
              onSome: ({ preset }) => [
                {
                  severity: "warning",
                  check: "duplicate",
                  message: `${id} has a name close to ${preset}. Check whether the preset rule already owns it.`,
                },
              ],
            }),
          ),
      },
    );
  });
};

const pathLike = /^(?![./])(?!.*:\/\/)[\w@+.-]+(?:\/[\w@+.-]+)+$/u;
const fileLike = /\.[A-Za-z\d]+$/u;
const pathKey = /(?:^(?:root|roots|file|fromFile|owners)$|Files$|Owners$|Roots?$)/u;

const collect = (value: Schema.Json, key: string): readonly string[] => {
  if (Predicate.isString(value))
    return pathLike.test(value) &&
      (fileLike.test(value) || pathKey.test(key)) &&
      !value.startsWith("@")
      ? [value]
      : [];
  if (jsonList(value)) return Array.flatMap(value, (entry) => collect(entry, key));
  if (value === null || Predicate.isNumber(value) || Predicate.isBoolean(value)) return [];
  return Array.flatMap(Record.toEntries(value), ([name, entry]) => collect(entry, name));
};

/** (c) Repository paths named by rule options, with the rule that names each. */
export const configuredPaths = (
  configs: readonly Config[],
): ReadonlyArray<{ readonly rule: string; readonly path: string }> =>
  Array.dedupeWith(
    Array.flatMap(ruleEntries(configs), ([rule, setting]) =>
      jsonList(setting)
        ? Array.map(
            Array.flatMap(Array.drop(setting, 1), (option) => collect(option, "")),
            (path) => ({ rule, path }),
          )
        : [],
    ),
    (left, right) => left.rule === right.rule && left.path === right.path,
  );

/**
 * The `ownerPaths.allowMissing` globs of the shared Commonplace repository
 * configuration (`commonplace.repository.json`). Other sections and keys belong
 * to the repository validators and are ignored here.
 */
export const RepositoryConfig = Schema.Struct({
  ownerPaths: Schema.optionalKey(
    Schema.Struct({ allowMissing: Schema.optionalKey(Schema.Array(Schema.String)) }),
  ),
});

// The repository validators' glob syntax: `**/` matches any folder prefix, `**`
// crosses folders, `*` and `?` stay in one segment, `{a,b}` picks one choice and
// `[...]` (or `[!...]`) is a character class.
const globPart = /(\*\*\/|\*\*|\*|\?|\{|\}|,|\[!?[^\]]*\])/u;
interface GlobState {
  readonly source: string;
  readonly depth: number;
}
const globStep = ({ source, depth }: GlobState, part: string): GlobState => {
  if (part === "**/") return { source: `${source}(?:.*/)?`, depth };
  if (part === "**") return { source: `${source}.*`, depth };
  if (part === "*") return { source: `${source}[^/]*`, depth };
  if (part === "?") return { source: `${source}[^/]`, depth };
  if (part === "{") return { source: `${source}(?:`, depth: depth + 1 };
  if (part === "}" && depth > 0) return { source: `${source})`, depth: depth - 1 };
  if (part === "," && depth > 0) return { source: `${source}|`, depth };
  if (part.startsWith("[") && part.length > 2)
    return { source: source + part.replace(/^\[!/u, "[^"), depth };
  return { source: source + part.replaceAll(/[.+^${}()|[\]\\]/gu, "\\$&"), depth };
};
// An unclosed `{` closes at the end so a typing slip cannot stop the doctor.
const globPattern = (glob: string): RegExp => {
  const { source, depth } = Array.reduce(glob.split(globPart), { source: "", depth: 0 }, globStep);
  return new RegExp(`^${source}${")".repeat(depth)}$`, "u");
};

/** (c) Configured paths that do not exist, except those tests create on demand. */
export const missingPathFindings = (
  paths: ReadonlyArray<{ readonly rule: string; readonly path: string }>,
  exists: (path: string) => boolean,
  allowMissing: readonly string[] = [],
): readonly Finding[] =>
  Array.flatMap(paths, ({ rule, path }): readonly Finding[] =>
    exists(path) || Array.some(allowMissing, (glob) => globPattern(glob).test(path))
      ? []
      : [
          {
            severity: "error",
            check: "path",
            message: `${rule} names ${path}, which does not exist.`,
          },
        ],
  );
