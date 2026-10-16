import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, it } from "@effect/vitest";
import { Array, Effect, FileSystem, Schema, Stream } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/process";

const Report = Schema.fromJsonString(
  Schema.Struct({
    diagnostics: Schema.Array(Schema.Struct({ code: Schema.String })),
    number_of_files: Schema.Int,
  }),
);
const Configuration = Schema.fromJsonString(
  Schema.Struct({
    jsPlugins: Schema.Array(Schema.String),
    rules: Schema.Record(Schema.String, Schema.Json),
  }),
);
const root = new URL("../../", import.meta.url).pathname;
const targets = [
  "apps/example/src/secrets.ts",
  "packages/example/src/secrets.ts",
  "packages/example/test/secrets.test.ts",
  "tools/example/secrets.ts",
  "alchemy.run.ts",
] as const;
const lint = Effect.fnUntraced(function* (source: string, target: (typeof targets)[number]) {
  const fs = yield* FileSystem.FileSystem;
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  return yield* Effect.scoped(
    Effect.gen(function* () {
      const directory = yield* fs.makeTempDirectoryScoped({ prefix: "native-secrets-" });
      const filename = `${directory}/${target}`;
      yield* fs.makeDirectory(filename.slice(0, filename.lastIndexOf("/")), { recursive: true });
      yield* fs.writeFileString(filename, source);
      const configuration = `${directory}/oxlint.json`;
      yield* fs.writeFileString(
        configuration,
        yield* Schema.encodeEffect(Configuration)({
          jsPlugins: [`${root}packages/oxlint-plugin/dist/alchemy.js`],
          rules: {
            "no-unused-vars": "off",
            "alchemy-secrets/native-sources": "error",
            "alchemy-secrets/explicit-stack-sources": "error",
            "alchemy-secrets/no-doppler-wrapper": "error",
          },
        }),
      );
      const handle = yield* spawner.spawn(
        ChildProcess.make(
          `${root}node_modules/.bin/oxlint`,
          ["--config", configuration, "--format", "json", target],
          { cwd: directory, stdout: "pipe", stderr: "inherit" },
        ),
      );
      const result = yield* Effect.all({
        exitCode: handle.exitCode,
        stdout: handle.stdout.pipe(
          Stream.decodeText,
          Stream.runFold(
            () => "",
            (text, chunk) => text + chunk,
          ),
        ),
      });
      return {
        exitCode: result.exitCode,
        report: yield* Schema.decodeEffect(Report)(result.stdout),
      };
    }),
  );
});
const imports = `import * as Alchemy from "alchemy";
import * as Doppler from "alchemy/Doppler";
import * as Secrets from "alchemy/Secrets";
import { Secrets as download } from "alchemy/Doppler";
import { DotEnv as dotenv, ProcessEnv as shell } from "alchemy/Secrets";
import { Stack as configure } from "alchemy";`;
const valid = `${imports}
const remote = Doppler.Secrets({ project: "fixture", config: "dev" });
const namespace = Secrets;
const { ProcessEnv: exclude } = namespace;
const disabled = { disabled: true };
export const sources = [remote, dotenv(), exclude(disabled)];
const settings = { providers, state, secrets: sources };
export const stack = configure("fixture", settings, program);
export const direct = Alchemy.Stack("fixture", { providers, state, secrets: sources }, program);
export const other = [download({}), Alchemy.Secrets.DotEnv(), shell({ disabled: true })];
export class Named extends Alchemy.Stack()("fixture") {}
`;
const invalid = [
  "export const sources = [Secrets.DotEnv(), Doppler.Secrets({}), Secrets.ProcessEnv({ disabled: true })];",
  "export const sources = [Doppler.Secrets({}), Secrets.DotEnv()];",
  "export const sources = [Doppler.Secrets({}), Secrets.DotEnv(), Secrets.ProcessEnv()];",
  "export const sources = [Doppler.Secrets({}), Secrets.DotEnv(), Secrets.ProcessEnv({ disabled: false })];",
  "export const sources = [Doppler.Secrets({}), Secrets.DotEnv(), ...others];",
  "const remote = download({}); export const sources = [dotenv(), remote, shell({ disabled: true })];",
  'export const source = Secrets.ProcessEnv(({ stage }) => ({ disabled: stage === "dev" }));',
  'export const stack = configure("fixture", { providers, state }, program);',
  'const settings = { providers, state }; export const stack = Alchemy.Stack("fixture", settings, program);',
  'export const stack = Alchemy.Stack("fixture", { providers, state, ...settings }, program);',
  'export const stack = Alchemy.Stack("fixture", { providers, state, secrets: undefined }, program);',
  'export const stack = Alchemy.Stack("fixture", { providers, state, secrets: [] }, program);',
];

it.effect(
  "rejects direct and shell Doppler injection while permitting native CLI and unrelated strings",
  () =>
    Effect.forEach(
      [
        {
          source:
            'import * as ChildProcess from "effect/process/ChildProcess"; export const command = ChildProcess.make("doppler", ["run", "--", "bun", "alchemy"]);',
          rejected: true,
        },
        {
          source:
            'import { make as command } from "effect/process/ChildProcess"; const binary = "/usr/bin/doppler"; export const wrapped = command(binary, ["run"]);',
          rejected: true,
        },
        {
          source:
            'import { ChildProcess as Commands } from "effect/process"; export const wrapped = Commands.make("doppler", ["run"]);',
          rejected: true,
        },
        {
          source:
            'import * as ChildProcess from "effect/process/ChildProcess"; export const command = ChildProcess.make("sh", ["-c", "doppler run -- bun alchemy plan"]);',
          rejected: true,
        },
        {
          source:
            'import * as ChildProcess from "effect/process/ChildProcess"; export const command = ChildProcess.make("bun", ["alchemy", "plan"]);',
          rejected: false,
        },
        {
          source:
            'import * as ChildProcess from "effect/process/ChildProcess"; export const command = ChildProcess.make("printf", ["doppler run is obsolete"]);',
          rejected: false,
        },
      ],
      ({ source, rejected }) =>
        Effect.gen(function* () {
          const result = yield* lint(source, "tools/example/secrets.ts");
          expect(result.report.number_of_files).toBe(1);
          expect(result.report.diagnostics).toHaveLength(rejected ? 1 : 0);
          if (rejected)
            expect(Array.map(result.report.diagnostics, ({ code }) => code)).toEqual([
              "alchemy-secrets(no-doppler-wrapper)",
            ]);
        }),
      { concurrency: 1 },
    ).pipe(Effect.provide(NodeServices.layer)),
  { timeout: 30_000 },
);

it.effect(
  "accepts native sources, immutable aliases, explicit stacks and shadowed unrelated methods",
  () =>
    Effect.forEach(
      [
        valid,
        `${imports}\nexport const read = (Doppler: typeof unrelated, Secrets: typeof unrelated) => [Doppler.Secrets(), Secrets.ProcessEnv()];`,
        `import type { Secrets } from "alchemy"; export const example = "doppler run";`,
      ],
      (source) =>
        Effect.gen(function* () {
          const result = yield* lint(source, "alchemy.run.ts");
          expect(result.exitCode).toBe(0);
          expect(result.report.number_of_files).toBe(1);
          expect(result.report.diagnostics).toHaveLength(0);
        }),
      { concurrency: 1 },
    ).pipe(Effect.provide(NodeServices.layer)),
);

it.effect(
  "rejects the reversed list, implicit or enabled shell, missing stack settings and opaque spreads",
  () =>
    Effect.forEach(
      invalid,
      (source) =>
        Effect.gen(function* () {
          const result = yield* lint(`${imports}\n${source}`, "alchemy.run.ts");
          expect(result.exitCode).not.toBe(0);
          expect(result.report.number_of_files).toBe(1);
          expect(result.report.diagnostics.length).toBeGreaterThan(0);
          expect(
            Array.every(result.report.diagnostics, ({ code }) =>
              code.startsWith("alchemy-secrets("),
            ),
          ).toBe(true);
        }),
      { concurrency: 1 },
    ).pipe(Effect.provide(NodeServices.layer)),
  { timeout: 30_000 },
);

it.effect(
  "runs the shared rules in every owned code location",
  () =>
    Effect.forEach(
      targets,
      (target) =>
        Effect.gen(function* () {
          const accepted = yield* lint(valid, target);
          expect(accepted.exitCode).toBe(0);
          const rejected = yield* lint(
            `${imports}\nexport const sources = [Doppler.Secrets({}), Secrets.DotEnv()];`,
            target,
          );
          expect(rejected.exitCode).not.toBe(0);
          expect(Array.map(rejected.report.diagnostics, ({ code }) => code)).toEqual([
            "alchemy-secrets(native-sources)",
          ]);
        }),
      { concurrency: 1 },
    ).pipe(Effect.provide(NodeServices.layer)),
  { timeout: 30_000 },
);
