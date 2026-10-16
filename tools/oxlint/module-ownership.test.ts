import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { Array, Effect, FileSystem, Schema, Stream } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/process";

// Each case starts the real Oxlint command; hundreds of runs need more than a minute
// when the machine is busy.
const realCommandBatchTimeout = 180_000;

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
            "strict-effect/module-ownership": [
              "error",
              {
                owners: [
                  { module: "private-sdk", allowedFiles, allowTypes: true },
                  { module: "@content/private", allowedFiles, allowTypes: false },
                  { module: "cloudflare:workers", allowedFiles, allowTypes: true },
                ],
              },
            ],
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

const rejected: ReadonlyArray<string> = [
  'import client from "private-sdk"; export const read = client;',
  'export { client } from "private-sdk/client";',
  'export * from "private-sdk";',
  'import client = require("private-sdk"); export const read = client;',
  'const address = "private-sdk"; export const read = import(address);',
  'const part = "sdk"; export const read = import(`private-${part}`);',
  'export const read = import("private-" + "sdk");',
  'const address = "private-sdk"; const alias = address; export const read = import(alias);',
  'export type Page = import("@content/private").Page;',
  'export type { Page } from "@content/private";',
  'import type { Page } from "@content/private"; export type Result = Page;',
  'import { env } from "cloudflare:workers"; export const bindings = env;',
  "export const read = (address: string) => import(address);",
  'const address = "public-sdk"; export const read = (address: string) => import(address);',
];
const accepted: ReadonlyArray<string> = [
  'import type { Client } from "private-sdk"; export type Result = Client;',
  'import { type Client } from "private-sdk"; export type Result = Client;',
  'export type Client = import("private-sdk").Client;',
  'export { type Client } from "private-sdk";',
  'import type { Env } from "cloudflare:workers"; export type Result = Env;',
  'export const options = { external: ["cloudflare:workers", "private-sdk"] };',
  'const address = "public-sdk"; export const read = import(address);',
  'const part = "sdk"; export const read = import(`public-${part}`);',
];

describe("canonical module ownership", () => {
  it.effect(
    "checks syntax and exact ownership in every owned path",
    () =>
      Effect.forEach(
        targets,
        (target) =>
          Effect.forEach(
            rejected,
            (source) =>
              Effect.gen(function* () {
                const result = yield* lint(source, target);
                expect(result.exitCode, source).toBe(1);
                expect(result.report.number_of_files).toBe(1);
                expect(
                  Array.some(
                    result.report.diagnostics,
                    ({ code }) => code === "strict-effect(module-ownership)",
                  ),
                  source,
                ).toBe(true);
                if (!source.includes("address: string")) {
                  const owner = yield* lint(source, target, [target]);
                  expect(owner.exitCode, source).toBe(0);
                  expect(owner.report.diagnostics).toEqual([]);
                }
              }),
            { concurrency: 1, discard: true },
          ),
        { concurrency: 1, discard: true },
      ).pipe(Effect.provide(NodeServices.layer)),
    realCommandBatchTimeout,
  );

  it.effect("allows types, native imports and ordinary config strings", () =>
    Effect.forEach(
      accepted,
      (source) =>
        lint(source, "binding.config.ts").pipe(
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

  it.effect("rejects neighbouring owners and broad exceptions", () =>
    Effect.forEach(
      [
        "apps/**/binding.adapter.layer.ts",
        "../apps/example/src/binding.adapter.layer.ts",
        "apps/example/src/other.adapter.layer.ts",
      ],
      (file) =>
        lint(
          'import client from "private-sdk"; export const read = client;',
          "apps/example/src/binding.adapter.layer.ts",
          [file],
        ).pipe(
          Effect.tap((result) =>
            Effect.sync(() => {
              expect(result.exitCode).toBe(1);
            }),
          ),
        ),
      { concurrency: 1, discard: true },
    ).pipe(Effect.provide(NodeServices.layer)),
  );
});
