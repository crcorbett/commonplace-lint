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

export const checkStyleConsumer = Effect.fnUntraced(function* (directory: string) {
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
});
