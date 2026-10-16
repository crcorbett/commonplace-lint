import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { Array, Effect, FileSystem, Schema, Stream } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/process";

const Report = Schema.Struct({
  diagnostics: Schema.Array(Schema.Struct({ code: Schema.String })),
  number_of_files: Schema.Int,
});
const root = new URL("../../", import.meta.url).pathname;
const policy = "packages/oxlint-plugin/dist/strict-effect.js";
const Configuration = Schema.fromJsonString(
  Schema.Struct({
    jsPlugins: Schema.Array(Schema.String),
    rules: Schema.Record(Schema.String, Schema.Json),
  }),
);

const targets = [
  "apps/example/src/immutable.fixture.ts",
  "packages/example/src/immutable.fixture.ts",
  "packages/example/test/immutable.fixture.ts",
  "tools/example/immutable.fixture.ts",
  "immutable.config.fixture.ts",
] as const;

const lint = Effect.fnUntraced(function* (
  source: string,
  target: (typeof targets)[number],
  exceptions: Schema.Json = {},
) {
  const fs = yield* FileSystem.FileSystem;
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  return yield* Effect.scoped(
    Effect.gen(function* () {
      const temporary = yield* fs.makeTempDirectoryScoped({ prefix: "immutable-policy-" });
      const filename = `${temporary}/${target}`;
      yield* fs.makeDirectory(filename.slice(0, filename.lastIndexOf("/")), { recursive: true });
      yield* fs.writeFileString(filename, source);
      const configuration = `${temporary}/oxlint.json`;
      const encoded = yield* Schema.encodeEffect(Configuration)({
        jsPlugins: [`${root}${policy}`],
        rules: { "strict-effect/no-imperative-collections": ["error", exceptions] },
      });
      yield* fs.writeFileString(configuration, encoded);
      const handle = yield* spawner.spawn(
        ChildProcess.make(
          `${root}node_modules/.bin/oxlint`,
          ["--config", configuration, "--format", "json", target],
          {
            cwd: temporary,
            stdout: "pipe",
            stderr: "pipe",
          },
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
        report: yield* Schema.decodeEffect(Schema.fromJsonString(Report))(result.stdout),
      };
    }),
  );
});

const invalid: ReadonlyArray<string> = [
  "export const read = () => { for (const value of [1]) { void value; } };",
  "export const read = () => { for (const key in {}) { void key; } };",
  "export const read = () => { for (;;) { break; } };",
  "export const read = () => { while (false) {} };",
  "export const read = () => { do {} while (false); };",
  "export const read = () => { let value = 1; value += 1; return value; };",
  "export const read = () => { var value = 1; value++; return value; };",
  "export const values = [1].map((value) => value + 1);",
  "export const method = [1].filter;",
  "export const values = Array.from([1]);",
  "export const values = globalThis.Array.of(1);",
  "export const values = new Array(1);",
  "export const read = () => { const values = [1]; values.push(2); return values; };",
  "export const read = () => { const value = { count: 0 }; value.count = 1; return value; };",
  'import { HashMap } from "effect"; export const values = HashMap.beginMutation(HashMap.empty());',
  'import { mutate as change } from "effect/HashMap"; export const values = change({});',
  'export const read = (value: { readonly _tag: string }) => value._tag === "Ready";',
  "export const read = (value: string) => { switch (value) { default: return value; } };",
  'import { Array as NativeLookingName } from "other-library"; export const values = NativeLookingName.map([1], (value) => value);',
  'import { Array as A } from "effect"; export const read = (A: { readonly map: () => void }) => A.map();',
  'import * as Namespace from "alchemy/Namespace"; export const read = (Namespace: { readonly push: () => void }) => Namespace.push();',
  'import * as Namespace from "other-library"; export const read = Namespace.push("Preview");',
];

const valid = `import { Array as A, Effect, HashMap, Match, Option, Ref } from "effect";
import * as Sequence from "effect/Array";
import { map as mapValues } from "effect/Array";
import * as E from "effect";
import * as Output from "alchemy/Output";
import * as NativeOutput from "alchemy/Output";
import * as Namespace from "alchemy/Namespace";
import * as NativeNamespace from "alchemy/Namespace";
export const values = A.map([1], (value) => value + 1);
export const filtered = Sequence.filter(values, (value) => value > 0);
export const named = mapValues(values, (value) => value);
export const total = E.Array.reduce(filtered, 0, (sum, value) => sum + value);
export const table = HashMap.set(HashMap.empty(), "key", total);
export const state = Ref.make(table);
export const update = state.pipe(Effect.flatMap((ref) => Ref.update(ref, (previous) => HashMap.set(previous, "key", total + 1))));
export const steps = A.unfold(0, (value) => value < 2 ? Option.some([value, value + 1] as const) : Option.none());
export const read = Effect.forEach(values, (value) => Effect.succeed(value), { concurrency: 1 });
export const optional = Option.match(Option.some(total), { onNone: () => 0, onSome: (value) => value });
export const choice = (value: { readonly _tag: "Ready" } | { readonly _tag: "Waiting" }) => Match.value(value).pipe(Match.tag("Ready", () => true), Match.tag("Waiting", () => false), Match.exhaustive);
declare const firstAddress: Output.Output<string>;
export const address = Output.map(firstAddress, (value) => value);
declare const secondAddress: NativeOutput.Output<string>;
export const second = NativeOutput.map(secondAddress, (value) => value);
export const preview = Effect.succeed("value").pipe(Namespace.push("Preview"));
export const nested = preview.pipe(NativeNamespace.push("Nested"));
`;

// Each case starts the real Oxlint command; hundreds of runs need more than a minute
// when the machine is busy.
const realCommandBatchTimeout = 180_000;

describe("canonical immutable Effect policy", () => {
  it.effect(
    "rejects imperative source and accepts imported functional operations in every owned path",
    () =>
      Effect.forEach(
        targets,
        (target) =>
          Effect.gen(function* () {
            yield* Effect.forEach(
              invalid,
              (source) =>
                Effect.gen(function* () {
                  const result = yield* lint(source, target);
                  expect(result.exitCode, target).toBe(1);
                  expect(result.report.number_of_files, target).toBe(1);
                  expect(
                    Array.map(result.report.diagnostics, ({ code }) => code),
                    source,
                  ).toContain("strict-effect(no-imperative-collections)");
                }),
              { concurrency: 1, discard: true },
            );
            const result = yield* lint(valid, target);
            expect(result.exitCode, target).toBe(0);
            expect(result.report.number_of_files, target).toBe(1);
            expect(result.report.diagnostics, target).toEqual([]);
          }),
        { concurrency: 1, discard: true },
      ).pipe(Effect.provide(NodeServices.layer)),
    realCommandBatchTimeout,
  );

  it.effect(
    "keeps host assignments and provider method allowances exact",
    () =>
      Effect.gen(function* () {
        const target = "apps/example/src/immutable.fixture.ts";
        const exception = {
          allowedAssignments: [{ file: target, target: "globalThis.hostFlag" }],
          allowedMethods: [{ file: target, receiver: "sdk", method: "push" }],
        };
        const source =
          "declare const sdk: { readonly push: () => void }; globalThis.hostFlag = true; sdk.push();";
        const accepted = yield* lint(source, target, exception);
        expect(accepted.exitCode).toBe(0);
        expect(accepted.report.diagnostics).toEqual([]);
        const nearby = yield* lint(
          "globalThis.otherFlag = true; const values = []; values.push(1);",
          target,
          exception,
        );
        expect(nearby.exitCode).toBe(1);
        expect(nearby.report.diagnostics).toHaveLength(2);
        yield* Effect.forEach(
          [
            "packages/example/src/immutable.fixture.ts",
            "packages/example/test/immutable.fixture.ts",
          ] as const,
          (other) =>
            lint(source, other, exception).pipe(
              Effect.tap((result) =>
                Effect.sync(() => {
                  expect(result.exitCode).toBe(1);
                  expect(result.report.diagnostics).toHaveLength(2);
                }),
              ),
            ),
          { concurrency: 1, discard: true },
        );
        yield* Effect.forEach(
          ["apps/**/immutable.fixture.ts", "../apps/example/src/immutable.fixture.ts"],
          (file) =>
            lint(source, target, {
              allowedAssignments: [{ file, target: "globalThis.hostFlag" }],
              allowedMethods: [{ file, receiver: "sdk", method: "push" }],
            }).pipe(
              Effect.tap((result) =>
                Effect.sync(() => {
                  expect(result.exitCode).toBe(1);
                  expect(result.report.diagnostics).toHaveLength(2);
                }),
              ),
            ),
          { concurrency: 1, discard: true },
        );
      }).pipe(Effect.provide(NodeServices.layer)),
    realCommandBatchTimeout,
  );
});
