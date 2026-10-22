import { expect } from "@effect/vitest";
import { Array, Effect, FileSystem, Option, Record, Schema } from "effect";
import { command, success } from "./command.js";

const Report = Schema.fromJsonString(
  Schema.Struct({
    diagnostics: Schema.Array(
      Schema.Struct({
        code: Schema.String,
        filename: Schema.String,
        message: Schema.String,
        severity: Schema.String,
      }),
    ),
    number_of_files: Schema.Int,
  }),
);
const Resolved = Schema.fromJsonString(
  Schema.Struct({
    rules: Schema.Record(Schema.String, Schema.Json),
    overrides: Schema.optionalKey(
      Schema.Array(
        Schema.Struct({ rules: Schema.optionalKey(Schema.Record(Schema.String, Schema.Json)) }),
      ),
    ),
  }),
);
const fixtures = [
  {
    file: "style-core.ts",
    source: "export const same = (value: string) => { return value; };",
    code: "eslint(arrow-body-style)",
  },
  {
    file: "style-react.tsx",
    source: "export const picture = <img />;",
    code: "jsx-a11y(alt-text)",
  },
  {
    file: "style-vitest.test.ts",
    source: 'import { it, expect } from "vitest"; it.only("works", () => { expect(1).toBe(1); });',
    code: "vitest(no-focused-tests)",
  },
];

export const checkStyleConsumer = Effect.fnUntraced(function* (
  directory: string,
  compiler: string,
) {
  const fs = yield* FileSystem.FileSystem;
  const executable = `${directory}/node_modules/.bin/oxlint`;
  yield* Effect.forEach(
    [
      { name: "empty", groups: "" },
      { name: "style", groups: "style" },
      { name: "strict", groups: "strict" },
      { name: "combined", groups: "style, strict" },
    ],
    ({ name, groups }) =>
      fs.writeFileString(
        `${directory}/${name}.config.ts`,
        `import { style, strict } from "@commonplaces/oxlint-plugin"; export default { extends: [${groups}] };`,
      ),
    { discard: true },
  );
  yield* Effect.forEach(
    fixtures,
    ({ file, source }) => fs.writeFileString(`${directory}/${file}`, source),
    { discard: true },
  );
  const lint = (name: string, files: readonly string[]) =>
    command(directory, executable, [
      "--config",
      `${name}.config.ts`,
      "--deny-warnings",
      "--format",
      "json",
      ...files,
    ]);
  const plain = yield* lint(
    "empty",
    Array.map(fixtures, ({ file }) => file),
  );
  expect(plain.exitCode, plain.stdout || plain.stderr).toBe(0);
  const styled = yield* lint(
    "style",
    Array.map(fixtures, ({ file }) => file),
  );
  expect(styled.exitCode, styled.stdout || styled.stderr).toBe(1);
  const report = yield* Schema.decodeEffect(Report)(styled.stdout);
  expect(report.number_of_files).toBe(fixtures.length);
  Array.forEach(fixtures, ({ file, code }) =>
    expect(
      Array.some(
        report.diagnostics,
        (diagnostic) => diagnostic.filename === file && diagnostic.code === code,
      ),
      code,
    ).toBe(true),
  );

  yield* fs.writeFileString(
    `${directory}/strict-safety.ts`,
    'export const choice = (ready: boolean) => ready ? "yes" : "no";',
  );
  const safetyFiles = ["style-core.ts", "strict-safety.ts"];
  const before = yield* lint("strict", safetyFiles);
  const beforeReport = yield* Schema.decodeEffect(Report)(before.stdout);
  expect(before.exitCode, before.stdout || before.stderr).toBe(1);
  expect(beforeReport.diagnostics).toEqual([
    expect.objectContaining({ code: "eslint(no-ternary)", filename: "strict-safety.ts" }),
  ]);
  const combinedStyle = yield* lint("combined", safetyFiles);
  expect(combinedStyle.exitCode).toBe(1);
  const combinedReport = yield* Schema.decodeEffect(Report)(combinedStyle.stdout);
  expect(combinedReport.diagnostics).toEqual(expect.arrayContaining([...beforeReport.diagnostics]));
  const after = yield* lint("strict", safetyFiles);
  expect(after.exitCode).toBe(before.exitCode);
  expect(yield* Schema.decodeEffect(Report)(after.stdout)).toEqual(beforeReport);
  const resolved = (name: string) =>
    success(directory, executable, ["--config", `${name}.config.ts`, "--print-config"]).pipe(
      Effect.flatMap(Schema.decodeEffect(Resolved)),
    );
  const strict = yield* resolved("strict");
  const combined = yield* resolved("combined");
  Array.forEach(Record.toEntries(strict.rules), ([name, setting]) => {
    if (setting !== "off" && setting !== "allow" && setting !== 0) {
      expect(Record.get(combined.rules, name), name).toEqual(Record.get(strict.rules, name));
      Array.forEach(combined.overrides ?? [], (override) =>
        Option.match(Record.get(override.rules ?? {}, name), {
          onNone: () => undefined,
          onSome: (value) => expect(value, name).toEqual(setting),
        }),
      );
    }
  });
  yield* checkEffectStyleConsumer(directory, compiler);
});

const effectFixtures = [
  {
    file: "effect-host.ts",
    source: `import { Effect } from "effect";

export const run = () => Effect.runPromise(Effect.succeed("ok"));`,
  },
  {
    file: "effect-adapter.ts",
    source: `import { Effect, Schema } from "effect";
import { read } from "./sdk";

export class ReadError extends Schema.TaggedError<ReadError, { readonly ReadError: unique symbol }>()("ReadError", { message: Schema.String }) {}
export const load = Effect.tryPromise({
  try: () => read(),
  catch: () => new ReadError({ message: "Could not read" }),
});`,
  },
  {
    file: "effect-collections.ts",
    source: `import { Array as A, Order } from "effect";
import { reduce as fold } from "effect/Array";

export const sum = A.reduce(0, (total, value: number) => total + value)([1, 2, 3]);
export const folded = fold(0, (total, value: number) => total + value)([1, 2, 3]);
export const reversed = A.reverse([1, 2, 3]);
export const sorted = A.sort(Order.Number)([3, 1, 2]);
export const first = A.head([1, 2, 3]);
export const last = A.last([1, 2, 3]);
export const copied = A.copy([1, 2, 3]);
export const doubled = A.map((value: number) => value * 2)([1, 2, 3]);
export const entries = A.flatMap((value: number) => [value])([1, 2, 3]);`,
  },
  {
    file: "effect-errors.ts",
    source: `import { Schema } from "effect";

export class ReadError extends Schema.TaggedError<ReadError, { readonly ReadError: unique symbol }>()("ReadError", { message: Schema.String }) {}
export class WriteError extends Schema.TaggedError<WriteError, { readonly WriteError: unique symbol }>()("WriteError", { message: Schema.String }) {}`,
  },
  {
    file: "effect-branches.ts",
    source: `export const notify = (ready: boolean, accept: () => void, decline: () => void) => {
  if (ready) { accept(); } else { decline(); }
};`,
  },
  {
    file: "effect-program.ts",
    source: `import { Effect, Layer } from "effect";

export const read = Effect.fn("Example.read")(function* () {
  return yield* Effect.succeed("ok");
});
export const program = Effect.gen(function* () {
  return yield* read();
});
export const live = Layer.empty;`,
  },
];

const checkEffectStyleConsumer = Effect.fnUntraced(function* (directory: string, compiler: string) {
  const fs = yield* FileSystem.FileSystem;
  const executable = `${directory}/node_modules/.bin/oxlint`;
  const files = Array.map(effectFixtures, ({ file }) => file);
  yield* Effect.forEach(
    effectFixtures,
    ({ file, source }) => fs.writeFileString(`${directory}/${file}`, source),
    { discard: true },
  );
  yield* fs.writeFileString(
    `${directory}/sdk.d.ts`,
    "export declare const read: () => Promise<string>;",
  );
  yield* fs.writeFileString(
    `${directory}/effect-style.tsconfig.json`,
    '{"compilerOptions":{"strict":true,"module":"Preserve","moduleResolution":"Bundler","target":"ES2024","skipLibCheck":true},"include":["effect-*.ts","sdk.d.ts"]}',
  );
  yield* success(directory, compiler, ["--noEmit", "-p", "effect-style.tsconfig.json"]);
  yield* Effect.forEach(
    [
      { name: "effect-strict", groups: "strict" },
      { name: "effect-combined", groups: "style, strict" },
    ],
    ({ name, groups }) =>
      fs.writeFileString(
        `${directory}/${name}.config.ts`,
        `import { style, strict } from "@commonplaces/oxlint-plugin";
export default {
  extends: [${groups}],
  rules: {
    "strict-effect/no-promise-workflow": ["error", { allowedFiles: ["effect-adapter.ts"] }],
    "effect/no-runtime-execution-outside-main": ["error", { allowedFiles: ["effect-host.ts"] }],
  },
};`,
      ),
    { discard: true },
  );
  const lint = (configuration: string, paths: readonly string[]) =>
    command(directory, executable, [
      "--config",
      `${configuration}.config.ts`,
      "--type-aware",
      "--tsconfig",
      "effect-style.tsconfig.json",
      "--deny-warnings",
      "--format",
      "json",
      ...paths,
    ]);
  yield* Effect.forEach(["effect-strict", "effect-combined"], (configuration) =>
    Effect.gen(function* () {
      const result = yield* lint(configuration, files);
      expect(result.exitCode, result.stdout || result.stderr).toBe(0);
      const report = yield* Schema.decodeEffect(Report)(result.stdout);
      expect(report.number_of_files).toBe(files.length);
      expect(report.diagnostics).toEqual([]);
    }),
  );

  // Restore the reported style rule to prove type-aware checking actually sees
  // the Promise return; otherwise a missing checker could make this test pass.
  yield* fs.writeFileString(
    `${directory}/effect-conflict.config.ts`,
    'import combined from "./effect-combined.config.ts"; export default { extends: [combined], rules: { "typescript/promise-function-async": "error" } };',
  );
  const conflict = yield* lint("effect-conflict", ["effect-host.ts"]);
  expect(conflict.exitCode, conflict.stdout || conflict.stderr).toBe(1);
  expect(conflict.stdout, conflict.stderr).toContain('"diagnostics"');
  expect((yield* Schema.decodeEffect(Report)(conflict.stdout)).diagnostics).toEqual([
    expect.objectContaining({ code: "typescript(promise-function-async)" }),
  ]);

  yield* fs.writeFileString(
    `${directory}/effect-invalid.ts`,
    `import { Effect } from "effect";

export const run = async () => Effect.runPromise(Effect.succeed("ok"));
export const mutate = (values: number[]) => { values.push(1); };
export const native = new Set([1, 2]);
export const loop = () => { for (let index = 0; index < 2; index++) { mutate([]); } };
export const fail = () => { throw new Error("failure"); };
export const choice = (ready: boolean) => ready ? "yes" : "no";
export const unchecked = (value: string | undefined) => value!;
export const clock = () => Date.now();
export const last = (values: readonly number[]) => values.at(-1);
export const reflected = (callback: () => string) => Reflect.apply(callback, "", []);`,
  );
  const before = yield* lint("effect-strict", ["effect-invalid.ts"]);
  const after = yield* lint("effect-combined", ["effect-invalid.ts"]);
  expect(before.exitCode, before.stdout || before.stderr).toBe(1);
  expect(after.exitCode, after.stdout || after.stderr).toBe(1);
  const beforeReport = yield* Schema.decodeEffect(Report)(before.stdout);
  const afterReport = yield* Schema.decodeEffect(Report)(after.stdout);
  expect(Array.map(afterReport.diagnostics, ({ code }) => code)).toEqual(
    expect.arrayContaining([
      "effect(no-async-await-promise)",
      "strict-effect(no-promise-workflow)",
      "strict-effect(no-imperative-collections)",
      "strict-effect(no-native-work)",
      "strict-effect(no-native-at)",
      "effect-conventions(no-native-collections)",
      "typescript(no-non-null-assertion)",
      "anti-slop(no-reflect-apply)",
      "eslint(no-ternary)",
      "effect(no-runtime-execution-outside-main)",
    ]),
  );
  expect(afterReport.diagnostics).toEqual(expect.arrayContaining([...beforeReport.diagnostics]));
});
