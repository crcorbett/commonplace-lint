import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { Array, Effect, FileSystem, Record, Schema, Stream } from "effect";
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
const fixtures = `${root}tools/oxlint/fixtures/schema-policy`;
// Each case starts the real Oxlint binary, which takes seconds under suite load.
const commandTimeout = 120_000;

// Example owners, named by role as a receiving repository's lint config would.
const orderSchemas = "packages/orders/src/schemas.ts";
const orderColumns = "packages/orders/src/columns.ts";
const storeSchemas = "packages/store/src/schemas.ts";
const sharedOrderSchemas = [
  {
    file: orderSchemas,
    module: "@example/orders/schemas",
    names: ["ContactEmail", "OrderTopic", "Order", "RecordPageId"],
  },
  { file: orderColumns, module: "@example/orders/columns", names: ["ColumnKind"] },
];
const sharedOrderFields = [
  { file: orderSchemas, declaration: "Order", field: "email", schema: "ContactEmail" },
  { file: orderSchemas, declaration: "Order", field: "topic", schema: "OrderTopic" },
  { file: storeSchemas, declaration: "ManagedColumn", field: "type", schema: "ColumnKind" },
];
const checkedOrderMaps = [
  { file: orderSchemas, name: "topicLabels", constraint: "Readonly<Record<OrderTopic, string>>" },
  {
    file: orderColumns,
    name: "orderColumns",
    constraint:
      "Readonly<Record<string, { readonly name: string; readonly type: typeof ColumnKind.Type }>>",
  },
  { file: orderColumns, name: "statusOptions", constraint: "readonly InitialStatusOption[]" },
];
const savedRecordIds = [
  { file: orderSchemas, names: ["RecordId", "RecordPageId", "RecordTableId", "RecordSourceId"] },
];
type RuleSettings = readonly [rule: string, setting: Schema.Json];
// All three rules together, as a receiving repository would enable them.
const configured: ReadonlyArray<RuleSettings> = [
  ["shared-schema-owner", ["error", { owners: sharedOrderSchemas, fields: sharedOrderFields }]],
  ["checked-constant-map", ["error", { maps: checkedOrderMaps }]],
  ["no-persisted-id-normalisation", ["error", { schemas: savedRecordIds }]],
];
const ruleNames = Array.map(configured, ([rule]) => rule);

// Copies one fixture to `target` inside a temporary working directory and runs
// the actual Oxlint command there, so exact owner paths resolve as they would
// in a receiving repository.
const lint = Effect.fnUntraced(function* (
  fixture: string,
  target: string,
  rules: ReadonlyArray<RuleSettings> = configured,
) {
  const fs = yield* FileSystem.FileSystem;
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const source = yield* fs.readFileString(`${fixtures}/${fixture}.ts`);
  return yield* Effect.scoped(
    Effect.gen(function* () {
      const temporary = yield* fs.makeTempDirectoryScoped({ prefix: "schema-policy-" });
      const filename = `${temporary}/${target}`;
      yield* fs.makeDirectory(filename.slice(0, filename.lastIndexOf("/")), { recursive: true });
      yield* fs.writeFileString(filename, source);
      const configuration = `${temporary}/oxlint.json`;
      yield* fs.writeFileString(
        configuration,
        yield* Schema.encodeEffect(Configuration)({
          jsPlugins: [`${root}packages/oxlint-plugin/dist/strict-effect.js`],
          rules: Record.fromEntries(
            Array.map(rules, ([rule, setting]): RuleSettings => [`strict-effect/${rule}`, setting]),
          ),
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
      const report = yield* Schema.decodeEffect(Report)(result.stdout);
      const count = (rule: string) =>
        Array.filter(report.diagnostics, ({ code }) => code === `strict-effect(${rule})`).length;
      return {
        exitCode: result.exitCode,
        files: report.number_of_files,
        codes: Array.join(
          Array.map(report.diagnostics, ({ code }) => code),
          ", ",
        ),
        count,
      };
    }),
  );
});

interface Case {
  readonly rule: string;
  readonly invalid: string;
  readonly valid: string;
  readonly target: string;
  readonly count: number;
}

const cases: ReadonlyArray<Case> = [
  {
    rule: "shared-schema-owner",
    invalid: "shared-schema-replicas",
    valid: "shared-schema-relative",
    target: "packages/orders/src/helper.ts",
    count: 4,
  },
  {
    rule: "shared-schema-owner",
    invalid: "shared-schema-fields",
    valid: "shared-schema-valid",
    target: storeSchemas,
    count: 9,
  },
  {
    rule: "checked-constant-map",
    invalid: "checked-maps-invalid",
    valid: "checked-maps-valid",
    target: orderColumns,
    count: 7,
  },
  {
    rule: "checked-constant-map",
    invalid: "checked-labels-invalid",
    valid: "checked-labels-valid",
    target: orderSchemas,
    count: 1,
  },
  {
    rule: "no-persisted-id-normalisation",
    invalid: "persisted-id-invalid",
    valid: "persisted-id-valid",
    target: orderSchemas,
    count: 9,
  },
];

describe("schema policy rules", () => {
  Array.forEach(cases, (entry) => {
    it.effect(
      `${entry.rule} rejects ${entry.invalid} and accepts ${entry.valid}`,
      () =>
        Effect.gen(function* () {
          const rejected = yield* lint(entry.invalid, entry.target);
          expect(rejected.files).toBe(1);
          expect(rejected.exitCode).toBe(1);
          expect(rejected.count(entry.rule), rejected.codes).toBe(entry.count);
          const accepted = yield* lint(entry.valid, entry.target);
          expect(accepted.files).toBe(1);
          expect(accepted.exitCode, accepted.codes).toBe(0);
        }).pipe(Effect.provide(NodeServices.layer)),
      commandTimeout,
    );
  });

  it.effect(
    "shared-schema-owner accepts the owner's own declarations and type aliases",
    () =>
      Effect.gen(function* () {
        const owner = yield* lint("shared-schema-owner", orderSchemas);
        expect(owner.files).toBe(1);
        expect(owner.exitCode, owner.codes).toBe(0);
        const neighbour = yield* lint(
          "shared-schema-owner",
          "packages/orders/src/schemas.helper.ts",
        );
        expect(neighbour.count("shared-schema-owner")).toBe(6);
      }).pipe(Effect.provide(NodeServices.layer)),
    commandTimeout,
  );

  it.effect(
    "keeps saved-ID and map checks confined to their exact configured files",
    () =>
      Effect.forEach(
        [
          {
            fixture: "persisted-id-invalid",
            target: "packages/orders/src/schemas.helper.ts",
            rule: "no-persisted-id-normalisation",
          },
          {
            fixture: "persisted-id-invalid",
            target: `copies/${orderSchemas}`,
            rule: "no-persisted-id-normalisation",
          },
          {
            fixture: "checked-maps-invalid",
            target: "packages/orders/src/columns.helper.ts",
            rule: "checked-constant-map",
          },
          {
            fixture: "checked-maps-invalid",
            target: `copies/${orderColumns}`,
            rule: "checked-constant-map",
          },
        ],
        Effect.fnUntraced(function* ({ fixture, target, rule }) {
          const result = yield* lint(fixture, target);
          expect(result.files).toBe(1);
          expect(result.count(rule), `${target}: ${result.codes}`).toBe(0);
        }),
        { concurrency: 1, discard: true },
      ).pipe(Effect.provide(NodeServices.layer)),
    commandTimeout,
  );

  it.effect(
    "respects a shadowed Effect import",
    () =>
      Effect.gen(function* () {
        const shadowed = yield* lint("persisted-id-shadowing", orderSchemas);
        expect(shadowed.files).toBe(1);
        expect(shadowed.count("no-persisted-id-normalisation")).toBe(0);
      }).pipe(Effect.provide(NodeServices.layer)),
    commandTimeout,
  );

  it.effect(
    "reports missing or malformed options instead of silently skipping protection",
    () =>
      Effect.gen(function* () {
        // Valid for Oxlint's JSON schema, but not a name the Schema check accepts.
        const malformed = yield* lint("persisted-id-valid", orderSchemas, [
          [
            "shared-schema-owner",
            [
              "error",
              {
                owners: [{ file: orderSchemas, module: "shared", names: ["invalid name"] }],
                fields: [],
              },
            ],
          ],
          [
            "checked-constant-map",
            [
              "error",
              { maps: [{ file: orderSchemas, name: "invalid name", constraint: "unknown" }] },
            ],
          ],
          [
            "no-persisted-id-normalisation",
            ["error", { schemas: [{ file: orderSchemas, names: ["invalid name"] }] }],
          ],
        ]);
        expect(malformed.files).toBe(1);
        expect(malformed.exitCode).toBe(1);
        Array.forEach(ruleNames, (rule) => {
          expect(malformed.count(rule), `${rule}: ${malformed.codes}`).toBe(1);
        });
        const missing = yield* lint(
          "persisted-id-valid",
          orderSchemas,
          Array.map(ruleNames, (rule): RuleSettings => [rule, "error"]),
        );
        expect(missing.files).toBe(1);
        Array.forEach(ruleNames, (rule) => {
          expect(missing.count(rule), `${rule}: ${missing.codes}`).toBe(1);
        });
      }).pipe(Effect.provide(NodeServices.layer)),
    commandTimeout,
  );
});
