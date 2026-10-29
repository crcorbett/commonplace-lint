import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { Array, Effect, FileSystem, Schema, Stream } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/process";

const Report = Schema.fromJsonString(
  Schema.Struct({
    diagnostics: Schema.Array(Schema.Struct({ code: Schema.String, message: Schema.String })),
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
  "apps/example/src/binding.adapter.layer.ts",
  "packages/example/src/binding.adapter.layer.ts",
  "packages/example/test/binding.adapter.layer.ts",
  "tools/example/binding.adapter.layer.ts",
  "binding.config.ts",
] as const;

const lint = Effect.fnUntraced(function* (
  source: string,
  target: (typeof targets)[number],
  allowedFiles: ReadonlyArray<string> = [],
  promiseOnlyFiles: ReadonlyArray<string> = [],
) {
  const fs = yield* FileSystem.FileSystem;
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  return yield* Effect.scoped(
    Effect.gen(function* () {
      const temporary = yield* fs.makeTempDirectoryScoped({ prefix: "promise-boundary-" });
      const filename = `${temporary}/${target}`;
      yield* fs.makeDirectory(filename.slice(0, filename.lastIndexOf("/")), { recursive: true });
      yield* fs.writeFileString(filename, source);
      const configuration = `${temporary}/oxlint.json`;
      yield* fs.writeFileString(
        configuration,
        yield* Schema.encodeEffect(Configuration)({
          jsPlugins: [`${root}packages/oxlint-plugin/dist/strict-effect.js`],
          rules: {
            "strict-effect/no-promise-workflow": ["error", { allowedFiles, promiseOnlyFiles }],
          },
        }),
      );
      const handle = yield* spawner.spawn(
        ChildProcess.make(
          `${root}node_modules/.bin/oxlint`,
          ["--config", configuration, "--format", "json", target],
          { cwd: temporary, stdout: "pipe", stderr: "pipe" },
        ),
      );
      const result = yield* Effect.all(
        {
          exitCode: handle.exitCode,
          stdout: handle.stdout.pipe(
            Stream.decodeText,
            Stream.runFold(
              () => "",
              (text, chunk) => text + chunk,
            ),
          ),
          stderr: handle.stderr.pipe(
            Stream.decodeText,
            Stream.runFold(
              () => "",
              (text, chunk) => text + chunk,
            ),
          ),
        },
        { concurrency: "unbounded" },
      );
      return {
        exitCode: result.exitCode,
        report: yield* Schema.decodeEffect(Report)(result.stdout),
      };
    }),
  );
});

const conversions: ReadonlyArray<string> = [
  'import { Effect } from "effect"; const adapt = Effect.tryPromise; export const read = adapt(() => client.read());',
  'import * as E from "effect"; const { Effect: F } = E; const { promise: adapt } = F; export const read = adapt(() => client.read());',
  'import { Effect } from "effect"; const first = Effect; const second = first; export const read = second["promise"](() => client.read());',
  'import { Effect } from "effect"; export const bridge = Effect.tryPromise;',

  'import { Effect } from "effect"; export const read = Effect.tryPromise(() => client.read());',
  'import * as E from "effect/Effect"; export const read = E.promise(() => client.read());',
  'import { tryPromise as adapt } from "effect/Effect"; export const read = adapt(() => client.read());',
  'import * as E from "effect"; export const read = E.Effect.promise(() => client.read());',
];

describe("canonical Promise conversion boundary", () => {
  it.effect("rejects dynamic imports even in exact adapters and host-contract tests", () =>
    Effect.forEach(
      targets,
      (target) =>
        Effect.forEach(
          [
            { allowed: [], contracts: [] },
            { allowed: [target], contracts: [] },
            { allowed: [], contracts: [target] },
          ],
          ({ allowed, contracts }) =>
            lint(
              `import * as Effect from "effect/Effect";
export const direct = import("sdk");
const moduleName = "sdk";
export const computed = import(moduleName);
export const attributed = import("./data.json", { with: { type: "json" } });
export const wrapped = Effect.tryPromise({ try: () => import("sdk"), catch: () => "unavailable" });`,
              target,
              allowed,
              contracts,
            ).pipe(
              Effect.tap((result) =>
                Effect.sync(() => {
                  expect(result.exitCode).toBe(1);
                  expect(result.report.number_of_files).toBe(1);
                  expect(
                    Array.filter(
                      result.report.diagnostics,
                      ({ code, message }) =>
                        code === "strict-effect(no-promise-workflow)" &&
                        message.startsWith("Dynamic imports are forbidden"),
                    ),
                  ).toHaveLength(4);
                }),
              ),
            ),
          { concurrency: 1, discard: true },
        ),
      { concurrency: 1, discard: true },
    ).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect(
    "requires exact adapter ownership in every owned path",
    () =>
      Effect.gen(function* () {
        yield* Effect.forEach(
          targets,
          (target) =>
            Effect.forEach(
              conversions,
              (source) =>
                Effect.gen(function* () {
                  const rejected = yield* lint(source, target);
                  expect(rejected.exitCode, source).toBe(1);
                  expect(rejected.report.number_of_files).toBe(1);
                  expect(rejected.report.diagnostics.length).toBeGreaterThan(0);
                  expect(
                    Array.every(
                      rejected.report.diagnostics,
                      ({ code }) => code === "strict-effect(no-promise-workflow)",
                    ),
                  ).toBe(true);
                  const accepted = yield* lint(source, target, [target]);
                  expect(accepted.exitCode, source).toBe(0);
                  expect(accepted.report.number_of_files).toBe(1);
                  expect(accepted.report.diagnostics).toEqual([]);
                }),
              { concurrency: 1, discard: true },
            ),
          { concurrency: 1, discard: true },
        );
        yield* Effect.forEach(
          [
            "apps/**/binding.adapter.layer.ts",
            "../apps/example/src/binding.adapter.layer.ts",
            "apps/example/src/other.adapter.layer.ts",
          ],
          (file) =>
            lint(
              'import { Effect } from "effect"; export const read = Effect.promise(() => client.read());',
              "apps/example/src/binding.adapter.layer.ts",
              [file],
            ).pipe(
              Effect.tap((result) =>
                Effect.sync(() => {
                  expect(result.exitCode).toBe(1);
                  expect(result.report.diagnostics).toHaveLength(1);
                }),
              ),
            ),
          { concurrency: 1, discard: true },
        );
      }).pipe(Effect.provide(NodeServices.layer)),
    60_000,
  );

  it.effect("limits a host-contract exception to promise in one exact test file", () =>
    Effect.forEach(
      [
        { name: "promise", expected: 0 },
        { name: "tryPromise", expected: 1 },
      ],
      ({ name, expected }) =>
        lint(
          `import { Effect } from "effect"; export const read = Effect.${name}(() => client.read());`,
          "packages/example/test/binding.adapter.layer.ts",
          [],
          ["packages/example/test/binding.adapter.layer.ts"],
        ).pipe(
          Effect.tap((result) =>
            Effect.sync(() => {
              expect(result.exitCode).toBe(expected);
            }),
          ),
        ),
      { concurrency: 1, discard: true },
    ).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect(
    "lets exact host-contract tests return settled Promise values only",
    () =>
      Effect.forEach(
        [
          { source: "export const accept = () => Promise.resolve();", promiseOnly: 0, other: 1 },
          {
            source: 'export const refuse = () => Promise.reject(new Error("duplicate"));',
            promiseOnly: 0,
            other: 1,
          },
          {
            source: "export const chain = () => Promise.resolve(1).then((value) => value);",
            promiseOnly: 1,
            other: 1,
          },
          {
            source: "export const build = () => new Promise(() => undefined);",
            promiseOnly: 1,
            other: 1,
          },
          { source: "export const all = () => Promise.all([]);", promiseOnly: 1, other: 1 },
        ],
        ({ source, promiseOnly, other }) =>
          Effect.gen(function* () {
            const target = "packages/example/test/binding.adapter.layer.ts";
            const contract = yield* lint(source, target, [], [target]);
            expect(contract.exitCode, source).toBe(promiseOnly);
            const neighbour = yield* lint(source, target);
            expect(neighbour.exitCode, source).toBe(other);
          }),
        { concurrency: 1, discard: true },
      ).pipe(Effect.provide(NodeServices.layer)),
    60_000,
  );

  it.effect("accepts native Effects and leaves unrelated or shadowed names alone", () =>
    Effect.forEach(
      [
        'import { Client } from "sdk"; export { Client }; export type ClientType = import("sdk").Client;',
        'export const example = \'import("sdk")\'; // import("sdk") is documentation, not execution.',
        'import { Effect } from "effect"; export const read = Effect.succeed(1).pipe(Effect.map((value) => value + 1));',
        'import * as Effect from "other-library"; export const read = Effect.promise();',
        'import { Effect } from "effect"; export const original = Effect.void; export const read = (Effect: { readonly promise: () => void }) => { const alias = Effect; return alias.promise(); };',
        'import { Effect } from "effect"; const field = "succeed"; export const read = Effect[field](1);',
        'import { Effect } from "effect"; export const original = Effect.void; export const read = (Effect: { readonly promise: () => void }) => Effect.promise();',
      ],
      (source) =>
        lint(source, "apps/example/src/binding.adapter.layer.ts").pipe(
          Effect.tap((result) =>
            Effect.sync(() => {
              expect(result.exitCode, source).toBe(0);
              expect(result.report.number_of_files).toBe(1);
              expect(result.report.diagnostics).toEqual([]);
            }),
          ),
        ),
      { concurrency: 1, discard: true },
    ).pipe(Effect.provide(NodeServices.layer)),
  );
});
