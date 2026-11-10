#!/usr/bin/env node
// Host adapter for `commonplace-lint-doctor`. The package runs no Effect
// runtime, so this command uses Node's synchronous file and process APIs at
// this one boundary; every check it reports is a pure function in checks.ts.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, normalize } from "node:path";
import { Array, Option, Record, Result, Schema } from "effect";
import strictEffect from "../strict-effect.js";
import effect from "../effect.js";
import alchemy from "../alchemy.js";
import bun from "../bun.js";
import packages from "../package.js";
import antiSlop from "../anti-slop/index.js";
import antiSlopEffect from "../anti-slop/effect/index.js";
import conventions from "../conventions.js";
import web from "../web.js";
import {
  Config,
  Manifest,
  RepositoryConfig,
  configuredPaths,
  extendedFiles,
  duplicateFindings,
  missingPathFindings,
  refreshFindings,
  versionFindings,
} from "./checks.js";
import type { Finding } from "./checks.js";

type Config = typeof Config.Type;

const directory = process.cwd();
const presetRules = Array.flatMap(
  [strictEffect, effect, alchemy, bun, packages, antiSlop, antiSlopEffect, conventions, web],
  (plugin) =>
    Option.match(Option.fromNullishOr(plugin.meta?.name), {
      onNone: () => [],
      onSome: (prefix) => Array.map(Record.keys(plugin.rules), (name) => `${prefix}/${name}`),
    }),
);
const configFiles = [
  "oxlint.config.ts",
  "oxlint.config.mts",
  "oxlint.config.js",
  "oxlint.config.mjs",
  ".oxlintrc.json",
  ".oxlintrc.jsonc",
];

const read = (file: string): Option.Option<string> =>
  existsSync(join(directory, file))
    ? Option.some(readFileSync(join(directory, file), "utf8"))
    : Option.none();

const manifestFindings = Option.match(
  read("package.json").pipe(
    Option.flatMap(Schema.decodeUnknownOption(Schema.fromJsonString(Manifest))),
  ),
  {
    onNone: (): readonly Finding[] => [
      { severity: "error", check: "config", message: "package.json is missing or unreadable." },
    ],
    onSome: (manifest) => [...versionFindings(manifest), ...refreshFindings(manifest)],
  },
);

// `--allow-missing <glob>` (repeatable) adds to `ownerPaths.allowMissing` in
// the shared `commonplace.repository.json`: paths that tests create on demand.
const flagGlobs = (args: readonly string[]): Result.Result<readonly string[], string> => {
  const [flag, ...rest] = args;
  if (flag === undefined) return Result.succeed([]);
  if (flag.startsWith("--allow-missing=")) {
    const glob = flag.slice("--allow-missing=".length);
    return glob === ""
      ? Result.fail("--allow-missing needs a glob.")
      : Result.map(flagGlobs(rest), (globs) => [glob, ...globs]);
  }
  if (flag !== "--allow-missing") return Result.fail(`Unknown argument ${flag}.`);
  const [glob, ...after] = rest;
  return glob === undefined || glob.startsWith("--")
    ? Result.fail("--allow-missing needs a glob.")
    : Result.map(flagGlobs(after), (globs) => [glob, ...globs]);
};
const repositoryFile = "commonplace.repository.json";
const flags = flagGlobs(process.argv.slice(2));
const repositoryGlobs = Option.match(read(repositoryFile), {
  onNone: () => Result.succeed<readonly string[]>([]),
  onSome: (text) =>
    Schema.decodeOption(Schema.fromJsonString(RepositoryConfig))(text).pipe(
      Result.fromOption(
        () =>
          `${repositoryFile} is not valid: it must be a JSON object whose optional ownerPaths.allowMissing is a list of glob strings.`,
      ),
      Result.map((config): readonly string[] => config.ownerPaths?.allowMissing ?? []),
    ),
});
const allowMissing = [
  ...Result.getOrElse(repositoryGlobs, () => []),
  ...Result.getOrElse(flags, () => []),
];
const allowMissingFindings = Array.flatMap([repositoryGlobs, flags], (result): readonly Finding[] =>
  Result.match(result, {
    onFailure: (message) => [{ severity: "error", check: "config", message }],
    onSuccess: () => [],
  }),
);

// Oxlint imports JavaScript and TypeScript configurations natively (TypeScript
// needs Node 22.18 or newer); the doctor does the same in a child process and
// receives the default export as JSON. `oxlint --print-config` is not used
// because it omits JavaScript plugin rules outside overrides.
const evaluate = `import(require("node:url").pathToFileURL(process.argv[1]).href).then((module) => process.stdout.write(JSON.stringify(module.default)));`;
const load = (file: string): Result.Result<Config, string> => {
  const text = /\.jsonc?$/u.test(file)
    ? read(file).pipe(Result.fromOption(() => `${file} does not exist.`))
    : (() => {
        const result = spawnSync(
          process.execPath,
          ["--input-type=commonjs", "--eval", evaluate, join(directory, file)],
          { cwd: directory, encoding: "utf8" },
        );
        return result.status === 0
          ? Result.succeed(result.stdout)
          : Result.fail(
              Option.getOrElse(
                Array.findFirst(
                  (result.stderr || result.error?.message || "").split("\n"),
                  (line) => /error/iu.test(line),
                ),
                () => "it could not be imported",
              ).trim(),
            );
      })();
  return Result.flatMap(text, (value) =>
    Schema.decodeOption(Schema.fromJsonString(Config))(value).pipe(
      Result.fromOption(() => `${file} is not a readable Oxlint configuration object.`),
    ),
  );
};
// Path-based `extends` entries resolve from the file that names them.
const loadAll = (
  file: string,
  seen: readonly string[],
): Result.Result<readonly Config[], string> =>
  Array.contains(seen, file)
    ? Result.succeed([])
    : Result.flatMap(load(file), (config) =>
        Result.map(
          Result.all(
            Array.map(extendedFiles(config), (entry) =>
              loadAll(normalize(join(dirname(file), entry)), [...seen, file]),
            ),
          ),
          (extended) => [config, ...Array.flatten(extended)],
        ),
      );

const configFindings = Option.match(
  Array.findFirst(configFiles, (file) => existsSync(join(directory, file))),
  {
    onNone: (): readonly Finding[] => [
      { severity: "error", check: "config", message: "No Oxlint configuration file was found." },
    ],
    onSome: (file): readonly Finding[] =>
      Result.match(loadAll(file, []), {
        onFailure: (reason) => [
          { severity: "error", check: "config", message: `Could not load ${file}: ${reason}` },
        ],
        onSuccess: (configs) => [
          ...duplicateFindings(configs, presetRules),
          ...missingPathFindings(
            configuredPaths(configs),
            (path) => existsSync(join(directory, path)),
            allowMissing,
          ),
        ],
      }),
  },
);

const findings = [...manifestFindings, ...allowMissingFindings, ...configFindings];
process.stdout.write(
  findings.length === 0
    ? "commonplace-lint-doctor: no problems found.\n"
    : `${Array.join(
        Array.map(findings, ({ severity, check, message }) => `${severity} ${check}: ${message}`),
        "\n",
      )}\n`,
);
if (Array.some(findings, ({ severity }) => severity === "error")) process.exitCode = 1;
