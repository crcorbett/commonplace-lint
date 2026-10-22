import { expect } from "@effect/vitest";
import { Array, Effect, FileSystem, Schema } from "effect";
import { command, success } from "./command.js";

const Report = Schema.fromJsonString(
  Schema.Struct({
    diagnostics: Schema.Array(
      Schema.Struct({
        code: Schema.String,
        filename: Schema.String,
        severity: Schema.String,
        message: Schema.String,
      }),
    ),
    number_of_files: Schema.Int,
  }),
);

const invalid = [
  {
    file: "native-unlisted.ts",
    source: 'import { it } from "@effect/vitest";\n\nexport const registration = it;',
    code: "effecttsgo(unstable-api-usage)",
  },
  {
    file: "native-floating.ts",
    source: 'import { Effect } from "effect";\n\nEffect.succeed(1);',
    code: "effecttsgo(floating-effect)",
  },
  {
    file: "native-generator.ts",
    source:
      'import { Effect } from "effect";\n\nexport const program = Effect.gen(function* () { yield Effect.succeed(1); });',
    code: "effecttsgo(missing-star-in-yield-effect-gen)",
  },
  {
    file: "native-brand.ts",
    source:
      'import { Schema } from "effect";\n\nexport class ReadError extends Schema.TaggedError<ReadError>()("ReadError", { message: Schema.String }) {}',
    code: "effecttsgo(schema-class-missing-brand)",
  },
  {
    file: "native-promise.ts",
    source:
      'import { Effect } from "effect";\nimport { read } from "./sdk";\n\nexport const program = Effect.succeed(read());',
    code: "effecttsgo(promise-in-effect-success)",
  },
  {
    file: "native-forgotten.test.ts",
    source:
      'import { it } from "vitest";\nimport { Effect } from "effect";\n\nit("forgets the program", () => Effect.succeed(1));',
    code: "effecttsgo(floating-effect-in-vitest)",
  },
  {
    file: "native-spread.ts",
    source:
      'import { Array as A } from "effect";\n\nexport const values = A.reduce([], (acc: readonly number[], value: number) => [...acc, value])([1, 2, 3]);',
    code: "strict-effect(no-copying-accumulator)",
  },
  {
    file: "native-append.ts",
    source:
      'import { Array as A } from "effect";\n\nexport const values = A.reduce([], (acc: readonly number[], value: number) => A.append(value)(acc))([1, 2, 3]);',
    code: "strict-effect(no-copying-accumulator)",
  },
];
const valid = [
  {
    file: "native-valid.ts",
    source: `import { Array as A, Chunk, Effect, HashMap, Record } from "effect";

export const program = Effect.gen(function* () { return yield* Effect.succeed(1); });
export const mapped = A.map((value: number) => value * 2)([1, 2, 3]);
export const flat = A.flatMap((value: number) => [value])([1, 2, 3]);
export const chunk = A.reduce(Chunk.empty<number>(), (acc, value: number) => Chunk.append(value)(acc))([1, 2, 3]);
export const indexed = A.reduce(HashMap.empty<number, number>(), (acc, value: number) => HashMap.set(value, value)(acc))([1, 2, 3]);
export const record = Record.fromEntries([["first", 1]]);`,
  },
  {
    file: "native-valid.test.ts",
    source: `import { expect, it } from "@effect/vitest";
import { Effect } from "effect";

it.effect("runs the program", () => Effect.gen(function* () {
  const value = yield* Effect.succeed(1);
  expect(value).toBe(1);
}));`,
  },
];

export const checkNativeConsumer = Effect.fnUntraced(function* (
  directory: string,
  compiler: string,
) {
  const fs = yield* FileSystem.FileSystem;
  const executable = `${directory}/node_modules/.bin/oxlint`;
  yield* Effect.forEach([...invalid, ...valid], ({ file, source }) =>
    fs.writeFileString(`${directory}/${file}`, source),
  );
  yield* success(directory, compiler, [
    "--ignoreConfig",
    "--noEmit",
    "--strict",
    "--skipLibCheck",
    "--module",
    "preserve",
    "--moduleResolution",
    "bundler",
    "--target",
    "ES2024",
    ...Array.map(valid, ({ file }) => file),
  ]);
  yield* fs.writeFileString(
    `${directory}/tsconfig.json`,
    '{"compilerOptions":{"strict":true,"module":"Preserve","moduleResolution":"Bundler","target":"ES2024","skipLibCheck":true,"plugins":[{"name":"@effect/language-service","diagnostics":false,"overrides":[{"include":["**/native-valid.test.ts"],"options":{"allowedUnstableApis":["@effect/vitest#it"]}}]}]},"include":["*.ts","*.tsx"]}',
  );
  yield* Effect.forEach(
    [
      { name: "native-effect", groups: "effect" },
      { name: "native-strict", groups: "style, strict" },
    ],
    ({ name, groups }) =>
      fs.writeFileString(
        `${directory}/${name}.config.ts`,
        `import { effect, style, strict } from "@commonplaces/oxlint-plugin"; export default { extends: [${groups}] };`,
      ),
  );
  const lint = (config: string, files: readonly string[]) =>
    command(directory, executable, [
      "--config",
      `${config}.config.ts`,
      "--tsconfig",
      "tsconfig.json",
      "--format",
      "json",
      ...files,
    ]);
  // No --type-aware or --deny-warnings: the exported group enables native checks
  // itself and every selected correctness rule must fail at error level.
  yield* Effect.forEach(["native-effect", "native-strict"], (config) =>
    Effect.gen(function* () {
      const result = yield* lint(
        config,
        Array.map(invalid, ({ file }) => file),
      );
      expect(result.exitCode, result.stdout || result.stderr).toBe(1);
      const report = yield* Schema.decodeEffect(Report)(result.stdout);
      expect(report.number_of_files).toBe(invalid.length);
      Array.forEach(invalid, ({ file, code }) =>
        expect(report.diagnostics).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ filename: file, code, severity: "error" }),
          ]),
        ),
      );
    }),
  );
  const accepted = yield* lint(
    "native-effect",
    Array.map(valid, ({ file }) => file),
  );
  expect(accepted.exitCode, accepted.stdout || accepted.stderr).toBe(0);
  expect((yield* Schema.decodeEffect(Report)(accepted.stdout)).diagnostics).toEqual([]);

  yield* fs.writeFileString(
    `${directory}/native-disabled.config.ts`,
    'import { effect } from "@commonplaces/oxlint-plugin"; export default { extends: [effect], rules: { "effecttsgo/floating-effect": "off", "strict-effect/no-copying-accumulator": "off" } };',
  );
  const disabled = yield* lint("native-disabled", [
    "native-floating.ts",
    "native-spread.ts",
    "native-append.ts",
  ]);
  expect(disabled.exitCode, disabled.stdout || disabled.stderr).toBe(0);
});
