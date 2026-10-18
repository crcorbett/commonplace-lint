import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, it } from "@effect/vitest";
import { Array, Effect, FileSystem, Schema, Stream } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/process";

const repository = new URL("../../../", import.meta.url).pathname;
const Report = Schema.Struct({
  diagnostics: Schema.Array(Schema.Struct({ code: Schema.String, filename: Schema.String })),
});
const Configuration = Schema.fromJsonString(
  Schema.Struct({
    jsPlugins: Schema.Array(Schema.String),
    rules: Schema.Record(Schema.String, Schema.Json),
  }),
);
interface RuleCase {
  readonly rule: string;
  readonly invalid: string;
  readonly valid: string;
}
const cases: readonly RuleCase[] = [
  {
    rule: "no-chained-type-assertions",
    invalid: "export const value = 1 as unknown as string;",
    valid: 'export const value = { name: "hello" } as const;',
  },
  {
    rule: "no-conditional-empty-object-spread",
    invalid: "export const value = { ...(ready ? { a: 1 } : {}) };",
    valid: "export const value = ready ? { a: 1 } : { a: 2 };",
  },
  {
    rule: "no-known-value-widening",
    invalid: 'type Wide = unknown; export const value: Wide = { name: "hello" };',
    valid: 'export const value = { name: "hello" };',
  },
  {
    rule: "no-module-mocking",
    invalid: 'import { vi as test } from "vitest"; test.mock("./service");',
    valid: 'export const use = (test: Client) => test.mock("./service");',
  },
  {
    rule: "no-object-parameters",
    invalid: "type Wide = object; export const use = (value: Wide) => value;",
    valid: "export type T = object; export const use = <T>(value: T) => value;",
  },
  {
    rule: "no-reflect-apply",
    invalid: "export const value = Reflect.apply(fn, null, []);",
    valid: "export const use = (Reflect: Client) => Reflect.apply(fn, null, []);",
  },
  {
    rule: "no-reflect-get",
    invalid: 'export const value = Reflect.get(input, "name");',
    valid: 'export const use = (Reflect: Client) => Reflect.get(input, "name");',
  },
  {
    rule: "no-runtime-typeof",
    invalid: 'export const value = typeof input === "string";',
    valid: "export const value = Schema.is(Schema.String)(input);",
  },
  {
    rule: "no-shape-in-symbol-names",
    invalid: "export const inputShape = 1;",
    valid: "export const Input = 1;",
  },
  {
    rule: "no-unknown-parameters",
    invalid: "export const use = (value: unknown) => value;",
    valid: "export const use = (value: string) => value;",
  },
  {
    rule: "no-unknown-returns",
    invalid: "type Wide = unknown; export const use = (): Promise<Wide> => pending;",
    valid: "export type T = unknown; export const use = <T>(value: T): T => value;",
  },
  {
    rule: "no-unknown-type-aliases",
    invalid: "type Raw = unknown; export type Input = Raw;",
    valid: "export type Identity<T> = T;",
  },
  {
    rule: "no-unsafe-dictionary-type",
    invalid: "type Dictionary<T> = Record<string, T>; export type Input = Dictionary<unknown>;",
    valid: "type Dictionary<T> = Record<string, T>; export type Input = Dictionary<string>;",
  },
  {
    rule: "no-widen-then-assert",
    invalid:
      'const original = { name: "hello" }; const wide: unknown = original; export const result = wide as { name: string };',
    valid: 'const original = { name: "hello" }; export const result = original;',
  },
  {
    rule: "require-safety-comment-for-type-assertion",
    invalid: "export const value = input as string;",
    valid: "// SAFETY: The caller has checked the input.\nexport const value = input as string;",
  },
];

const lint = Effect.fnUntraced(function* (
  directory: string,
  rules: Readonly<Record<string, Schema.Json>>,
  files: readonly string[],
  plugin: string,
) {
  const fs = yield* FileSystem.FileSystem;
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  yield* fs.writeFileString(
    `${directory}/oxlint.json`,
    yield* Schema.encodeEffect(Configuration)({
      jsPlugins: [`${repository}packages/oxlint-plugin/dist/${plugin}.js`],
      rules,
    }),
  );
  return yield* Effect.scoped(
    Effect.gen(function* () {
      const child = yield* spawner.spawn(
        ChildProcess.make(
          `${repository}node_modules/.bin/oxlint`,
          ["--config", "oxlint.json", "--format", "json", ...files],
          { cwd: directory, stdout: "pipe", stderr: "pipe" },
        ),
      );
      const read = (stream: typeof child.stdout) =>
        stream.pipe(
          Stream.decodeText,
          Stream.runFold(
            () => "",
            (text, chunk) => text + chunk,
          ),
        );
      return yield* Effect.all(
        {
          exitCode: child.exitCode,
          stdout: read(child.stdout),
          stderr: read(child.stderr),
        },
        { concurrency: "unbounded" },
      );
    }),
  );
});

Array.forEach(cases, ({ rule, invalid, valid }) => {
  it.effect(`preserves ${rule} and keeps files independent`, () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const directory = yield* fs.makeTempDirectoryScoped({ prefix: "lint-rule-" });
      yield* fs.writeFileString(`${directory}/invalid.ts`, invalid);
      yield* fs.writeFileString(`${directory}/valid.ts`, valid);
      const result = yield* lint(
        directory,
        { [`anti-slop/${rule}`]: "error" },
        ["invalid.ts", "valid.ts"],
        "anti-slop/index",
      );
      expect(result.exitCode, result.stderr || result.stdout).toBe(1);
      const report = yield* Schema.decodeEffect(Schema.fromJsonString(Report))(result.stdout);
      expect(
        Array.some(
          report.diagnostics,
          (diagnostic) =>
            diagnostic.code === `anti-slop(${rule})` && diagnostic.filename.endsWith("invalid.ts"),
        ),
      ).toBe(true);
      expect(
        Array.filter(
          report.diagnostics,
          (diagnostic) =>
            diagnostic.filename.endsWith("valid.ts") && !diagnostic.filename.endsWith("invalid.ts"),
        ),
      ).toEqual([]);
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );
});

it.effect(
  "supports configured and automatic tracing, and rejects malformed or empty selectors",
  () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const directory = yield* fs.makeTempDirectoryScoped({ prefix: "lint-options-" });
      const source =
        'import { Effect } from "effect"; const run = Effect.fn("Orders.create")(() => Effect.void); Orders.of({ create: run }); Effect.runSync(Effect.void);';
      yield* fs.writeFileString(`${directory}/entry.ts`, source);
      yield* fs.writeFileString(
        `${directory}/other.ts`,
        source.replace('"Orders.create"', '"Wrong.name"'),
      );
      const rules = {
        "effect/no-runtime-execution-outside-main": ["error", { allowedFiles: ["entry.ts"] }],
        "effect/require-service-operation-instrumentation": ["error", { serviceNames: ["Orders"] }],
      } satisfies Readonly<Record<string, Schema.Json>>;
      const result = yield* lint(directory, rules, ["entry.ts", "other.ts"], "effect");
      expect(result.exitCode, result.stderr || result.stdout).toBe(1);
      const report = yield* Schema.decodeEffect(Schema.fromJsonString(Report))(result.stdout);
      expect(report.diagnostics).toHaveLength(2);
      expect(
        Array.every(report.diagnostics, (diagnostic) => diagnostic.filename.endsWith("other.ts")),
      ).toBe(true);
      yield* fs.writeFileString(
        `${directory}/automatic.ts`,
        'import { Orders } from "./service";\n' + source,
      );
      const automatic = yield* lint(
        directory,
        { "effect/require-service-operation-instrumentation": "error" },
        ["automatic.ts"],
        "effect",
      );
      expect(automatic.exitCode, automatic.stderr || automatic.stdout).toBe(0);
      yield* Effect.forEach(
        [
          ["error", { serviceNames: "Orders" }],
          ["error", { serviceNames: [] }],
        ],
        Effect.fnUntraced(function* (setting) {
          const invalid = yield* lint(
            directory,
            { "effect/require-service-operation-instrumentation": setting },
            ["entry.ts"],
            "effect",
          );
          expect(invalid.exitCode).not.toBe(0);
        }),
        { concurrency: 1 },
      );
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
);
