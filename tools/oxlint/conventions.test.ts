import { conventionCases } from "./conventions.cases";
import { accumulationCases } from "./accumulation.cases";
import type { Case } from "./conventions.cases";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import { Array, Effect, FileSystem, Path, Schema, Stream } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/process";

const root = new URL("../../", import.meta.url).pathname;
const Config = Schema.fromJsonString(
  Schema.Struct({
    jsPlugins: Schema.Array(Schema.String),
    rules: Schema.Record(Schema.String, Schema.Json),
  }),
);
const Report = Schema.fromJsonString(
  Schema.Struct({
    diagnostics: Schema.Array(Schema.Struct({ code: Schema.String, message: Schema.String })),
    number_of_files: Schema.Int,
  }),
);

const cases: readonly Case[] = [
  ...conventionCases,
  ...accumulationCases,
  {
    rule: "require-service-operation-instrumentation",
    plugin: "effect",
    invalid:
      'import { Content } from "./service"; import { Effect } from "effect"; export const x = Content.of({ read: Effect.void });',
    valid:
      'import { Worker } from "@alchemy.run/cloudflare"; export const x = Worker.of({ read: unknownOperation });',
  },
  {
    rule: "require-service-operation-instrumentation",
    plugin: "effect",
    invalid:
      'import * as Services from "./service"; import { Effect } from "effect"; const { Content: C } = Services; export const x = C.of({ read: Effect.void });',
    valid:
      'import * as Services from "./service"; import { Effect } from "effect"; const { Content: C } = Services; export const x = C.of({ read: Effect.void.pipe(Effect.withSpan("Content.read")) });',
  },
  {
    rule: "require-service-operation-instrumentation",
    plugin: "effect",
    invalid:
      'import * as Services from "./service"; import { Layer as L, Effect as E } from "effect"; const Alias = Services; export const x = L.mock(Alias.Content, { read: E.void });',
    valid:
      'import * as Services from "./service"; import { Layer as L, Effect as E } from "effect"; const Alias = Services; export const x = L.mock(Alias.Content, { read: E.void.pipe(E.withSpan("Content.read")) });',
  },
  {
    rule: "require-service-operation-instrumentation",
    plugin: "effect",
    invalid:
      'import { Layer as L, Effect as E } from "effect"; import { Content as Library } from "./service"; export const x = L.mock(Library, { read: E.void });',
    valid:
      'import { Layer as L, Effect as E } from "effect"; import { Content as Library } from "./service"; export const x = L.mock(Library, { read: E.void.pipe(E.withSpan("Content.read")) });',
  },
  {
    rule: "require-service-operation-instrumentation",
    plugin: "effect",
    invalid:
      'import { Layer as L, Effect as E } from "effect"; import { Content } from "./service"; export const x = L.mock(Content, { read: E.void });',
    valid:
      'import { Layer as L, Effect as E } from "effect"; import { Content } from "./service"; export const x = (L: Client) => L.mock(Content, { read: E.void });',
  },
  {
    rule: "require-service-operation-instrumentation",
    plugin: "effect",
    options: {
      operationAdapters: [
        {
          module: "@archive/content/response",
          file: "packages/content/src/response.ts",
          exports: ["checkedPageOperation"],
          operation: "Content.getPage",
        },
      ],
    },
    invalid:
      'import { Content } from "./service"; import { other } from "@archive/content/response"; export const x = Content.of({ getPage: other(opaque) });',
    valid:
      'import { Content } from "./service"; import { checkedPageOperation as checked } from "@archive/content/response"; const adapter = checked; export const x = Content.of({ getPage: adapter(opaque) });',
  },
  {
    rule: "require-service-operation-instrumentation",
    plugin: "effect",
    file: "packages/content/src/live.layer.ts",
    options: {
      operationAdapters: [
        {
          module: "@archive/content/response",
          file: "packages/content/src/response.ts",
          exports: ["checkedPageOperation"],
          operation: "Content.getPage",
        },
      ],
    },
    invalid:
      'import { Content } from "./service"; import { checkedPageOperation } from "./neighbour/response"; export const x = Content.of({ getPage: checkedPageOperation(opaque) });',
    valid:
      'import { Content } from "./service"; import { checkedPageOperation } from "./response"; export const x = Content.of({ getPage: checkedPageOperation(opaque) });',
  },
  {
    rule: "require-service-operation-instrumentation",
    plugin: "effect",
    options: {
      operationAdapters: [
        {
          module: "@archive/content/response",
          file: "packages/content/src/response.ts",
          exports: ["checkedPageOperation"],
          operation: "Content.getPage",
        },
      ],
    },
    invalid:
      'import { Content } from "./service"; import { checkedPageOperation } from "@archive/content/response"; export const x = (checkedPageOperation: Callback) => Content.of({ getPage: checkedPageOperation(opaque) });',
    valid:
      'import { Content } from "./service"; import { checkedPageOperation } from "@archive/content/response"; export const x = Content.of({ getPage: checkedPageOperation(opaque) });',
  },
  {
    rule: "require-service-operation-instrumentation",
    plugin: "effect",
    options: {
      operationAdapters: [
        {
          module: "@archive/content/response",
          file: "packages/content/src/response.ts",
          exports: ["checkedPageOperation"],
          operation: "Content.getPage",
        },
      ],
    },
    invalid:
      'import { Other } from "./service"; import { checkedPageOperation } from "@archive/content/response"; export const x = Other.of({ getPage: checkedPageOperation(opaque) });',
    valid:
      'import { Content } from "./service"; import { checkedPageOperation } from "@archive/content/response"; export const x = Content.of({ getPage: checkedPageOperation(opaque) });',
  },
  {
    rule: "require-service-operation-instrumentation",
    plugin: "effect",
    invalid:
      'import { Content as Library } from "./service"; import { Effect as E } from "effect"; export const x = Library.of({ read: E.void });',
    valid:
      'import { Content as Library } from "./service"; import { Effect as E } from "effect"; export const x = Library.of({ read: E.void.pipe(E.withSpan("Content.read")) });',
  },
  {
    rule: "require-service-operation-instrumentation",
    plugin: "effect",
    invalid:
      'import * as Services from "./service"; import { Effect } from "effect"; export const x = Services.Content.of({ read: Effect.fn("Wrong.read")(() => Effect.void) });',
    valid:
      'import * as Services from "./service"; import { Effect } from "effect"; export const x = Services.Content.of({ read: Effect.fn("Content.read")(() => Effect.void) });',
  },
  {
    rule: "require-service-operation-instrumentation",
    plugin: "effect",
    invalid:
      'import { Content } from "./service"; import { Effect } from "effect"; export const x = Content.of({ read: () => { const unrelated = Effect.fn("Content.read")(() => Effect.void); return Effect.void; } });',
    valid:
      'import { Content } from "./service"; import { Effect } from "effect"; const read = Effect.fn("Content.read")(() => Effect.void); export const x = Content.of({ read });',
  },
  {
    rule: "require-service-operation-instrumentation",
    plugin: "effect",
    invalid:
      'import { Content } from "./service"; import { Effect } from "effect"; export const x = Content.of({ ...opaque });',
    valid:
      'import { Content } from "./service"; import { Effect } from "effect"; export const x = (Content: Client) => Content.of({ read: Effect.void });',
  },
  {
    rule: "require-service-operation-instrumentation",
    plugin: "effect",
    invalid:
      'import { Context, Effect, Option } from "effect"; class Client extends Context.Service<Client, { readonly id: Option.Option<string>; readonly read: Effect.Effect<void> }>()("Client") {} export const x = Client.of({ id: Option.none(), read: Effect.void });',
    valid:
      'import { Context, Effect, Option, Stream } from "effect"; class Client extends Context.Service<Client, { readonly id: Option.Option<string>; readonly read: Effect.Effect<void>; readonly changes: Stream.Stream<void> }>()("Client") {} export const x = Client.of({ id: Option.none(), read: Effect.void.pipe(Effect.withSpan("Client.read")), changes: Stream.empty });',
  },
];

const lint = Effect.fnUntraced(function* (directory: string, entry: Case, text: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const file = entry.file ?? "input.ts";
  const plugin = entry.plugin ?? "conventions";
  const namespace = entry.namespace ?? (plugin === "conventions" ? "effect-conventions" : plugin);
  const qualified = `${namespace}/${entry.rule}`;
  yield* fs.makeDirectory(path.dirname(`${directory}/${file}`), { recursive: true });
  yield* fs.writeFileString(`${directory}/${file}`, text);
  yield* fs.writeFileString(
    `${directory}/oxlint.json`,
    yield* Schema.encodeEffect(Config)({
      jsPlugins: [`${root}packages/oxlint-plugin/dist/${plugin}.js`],
      rules: { [qualified]: entry.options ? ["error", entry.options] : "error" },
    }),
  );
  return yield* Effect.scoped(
    Effect.gen(function* () {
      const child = yield* spawner.spawn(
        ChildProcess.make(
          `${root}node_modules/.bin/oxlint`,
          ["--config", "oxlint.json", "--format", "json", file],
          { cwd: directory, stdout: "pipe", stderr: "inherit" },
        ),
      );
      const result = yield* Effect.all(
        {
          exit: child.exitCode,
          text: child.stdout.pipe(
            Stream.decodeText,
            Stream.runFold(
              () => "",
              (current, chunk) => current + chunk,
            ),
          ),
        },
        { concurrency: "unbounded" },
      );
      return {
        exit: result.exit,
        report: yield* Schema.decodeEffect(Report)(result.text),
        namespace,
      };
    }),
  );
});

Array.forEach(cases, (entry) =>
  it.effect(
    `enforces shared ${entry.plugin ?? "conventions"}/${entry.rule}: ${entry.invalid.slice(0, 45)}`,
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const directory = yield* fs.makeTempDirectoryScoped({ prefix: "commonplace-convention-" });
        const bad = yield* lint(directory, entry, entry.invalid);
        assert.notStrictEqual(bad.exit, 0);
        assert.strictEqual(bad.report.number_of_files, 1);
        assert.isTrue(
          Array.some(
            bad.report.diagnostics,
            (diagnostic) => diagnostic.code === `${bad.namespace}(${entry.rule})`,
          ),
        );
        const good = yield* lint(directory, entry, entry.valid);
        assert.strictEqual(
          good.exit,
          0,
          Array.map(good.report.diagnostics, (diagnostic) => diagnostic.message).join("; "),
        );
        assert.strictEqual(good.report.number_of_files, 1);
      }).pipe(Effect.provide(NodeServices.layer)),
  ),
);
