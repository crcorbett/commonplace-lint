import { expect } from "@effect/vitest";
import { Array, Effect, FileSystem, Schema } from "effect";
import { command, success } from "./command.js";

const Report = Schema.fromJsonString(
  Schema.Struct({
    diagnostics: Schema.Array(Schema.Struct({ code: Schema.String })),
    number_of_files: Schema.Int,
  }),
);
const Configuration = Schema.fromJsonString(
  Schema.Struct({
    jsPlugins: Schema.Array(Schema.String),
    rules: Schema.Record(Schema.String, Schema.String),
  }),
);
const contracts =
  'import { Context, Effect, Layer } from "effect"; class Content extends Context.Service<Content, { readonly read: (id: string) => Effect.Effect<string> }>()("Content") {} class ContentRead extends Context.Service<ContentRead, { readonly read: (id: string) => Effect.Effect<string> }>()("ContentRead") {}';

export const checkServiceConsumer = Effect.fnUntraced(function* (directory: string) {
  const fs = yield* FileSystem.FileSystem;
  const binary = `${directory}/node_modules/.bin/oxlint`;
  yield* fs.writeFileString(
    `${directory}/service-guards.json`,
    yield* Schema.encodeEffect(Configuration)({
      jsPlugins: ["@commonplaces/oxlint-plugin/effect"],
      rules: {
        "effect/no-service-decorators": "error",
        "effect/no-redundant-operation-wrappers": "error",
        "effect/require-service-operation-instrumentation": "error",
      },
    }),
  );
  yield* fs.writeFileString(
    `${directory}/service-decorator.ts`,
    contracts +
      'export const decorated = Layer.effect(Content, Effect.gen(function* () { const original = yield* Content; return { read: Effect.fn("Content.read")((id) => original.read(id)) } satisfies Content["Service"]; }));',
  );
  yield* fs.writeFileString(
    `${directory}/service-untraced.ts`,
    contracts +
      'export const plain = Layer.effect(Content, Effect.gen(function* () { return { read: id => Effect.succeed(id) } satisfies Content["Service"]; }));',
  );
  const bad = yield* command(directory, binary, [
    "--config",
    "service-guards.json",
    "--format",
    "json",
    "service-decorator.ts",
    "service-untraced.ts",
  ]);
  expect(bad.exitCode).not.toBe(0);
  const report = yield* Schema.decodeEffect(Report)(bad.stdout);
  expect(report.number_of_files).toBe(2);
  expect(Array.map(report.diagnostics, ({ code }) => code)).toEqual(
    expect.arrayContaining([
      "effect(no-service-decorators)",
      "effect(no-redundant-operation-wrappers)",
      "effect(require-service-operation-instrumentation)",
    ]),
  );
  yield* fs.writeFileString(
    `${directory}/service-direct.ts`,
    contracts +
      'export const direct = Layer.effect(Content, Effect.gen(function* () { const original = yield* ContentRead; return { read: original.read } satisfies Content["Service"]; }));' +
      'class Settings extends Context.Service<Settings, { origin: string }>()("Settings") {} const policy = {}; export const settings = Layer.succeed(Settings, { origin: "https://example.test", ...policy, metadata: {} });' +
      'export const mixed = Content.of({ read: Effect.fn("Content.read")(() => Effect.void), capabilities: { enabled: policy !== undefined, links: !disabled } });',
  );
  const good = yield* success(directory, binary, [
    "--config",
    "service-guards.json",
    "--format",
    "json",
    "service-direct.ts",
  ]);
  expect((yield* Schema.decodeEffect(Report)(good)).diagnostics).toEqual([]);
});
