import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, it } from "@effect/vitest";
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

const lint = Effect.fnUntraced(function* (source: string, target: (typeof targets)[number]) {
  const fs = yield* FileSystem.FileSystem;
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  return yield* Effect.scoped(
    Effect.gen(function* () {
      const temporary = yield* fs.makeTempDirectoryScoped({ prefix: "static-layers-policy-" });
      const filename = `${temporary}/${target}`;
      yield* fs.makeDirectory(filename.slice(0, filename.lastIndexOf("/")), { recursive: true });
      yield* fs.writeFileString(filename, source);
      const configuration = `${temporary}/oxlint.json`;
      const encoded = yield* Schema.encodeEffect(Configuration)({
        jsPlugins: [`${root}${policy}`],
        rules: { "strict-effect/static-layers": "error" },
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

const invalid = `import * as Layer from "effect/Layer";
import * as Native from "effect";
import { succeed as construct, empty } from "effect/Layer";
import type { Layer as NativeLayer } from "effect/Layer";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Function from "effect/Function";
import { foreign } from "./foreign";
import * as HttpRouter from "effect/http/HttpRouter";

class Fixture extends Context.Service<Fixture, { readonly value: number }>()("Fixture") {}
const namespace = Layer;
const make = construct;
const { succeed: destructured } = Layer;
const staticLayer = Layer.succeed(Fixture, { value: 1 });
type Alias = NativeLayer<Fixture>;
export type FactorySignature = () => NativeLayer<Fixture>;

export const direct = () => Layer.succeed(Fixture, { value: 1 });
export function declaration() {
  return Layer.succeed(Fixture, { value: 1 });
}
export const expression = function factory() {
  return Layer.succeed(Fixture, { value: 1 });
};
export const rootNamespace = () => Native.Layer.succeed(Fixture, { value: 1 });
export const namespaceAlias = () => namespace.succeed(Fixture, { value: 1 });
export const functionAlias = () => make(Fixture, { value: 1 });
export const destructuredAlias = () => destructured(Fixture, { value: 1 });
export const curried = () => Layer.succeed(Fixture)({ value: 1 });
export const returnStatic = () => staticLayer;
export const returnEmpty = () => empty;
export const pipeline = () => staticLayer.pipe(Layer.provide(Layer.empty));
export const functionalPipeline = () => Function.pipe(staticLayer, Layer.provide(Layer.empty));
export const typed = (): NativeLayer<Fixture> => foreign();
export const aliasedType = (): Alias => foreign();
export const typedRoot = (): Native.Layer.Layer<Fixture> => foreign();
export const routes = () => HttpRouter.addAll(Effect.succeed([]));
export const branch = (enabled: boolean) => {
  if (enabled) {
    return staticLayer;
  }
  return Layer.empty;
};
export const objectFactory = { make: () => Layer.empty };

// None of these private factories is an approved exception either.
const privateFactory = () => Layer.empty;
export const privateResult = privateFactory();
export const barePipe = () => staticLayer.pipe();
export const bareFunctionalPipe = () => Function.pipe(staticLayer);
export const discarded = () => Layer.orDie(staticLayer);
export const traced = () => Layer.span("fixture");
export const opaqueCallback = foreign(() => Layer.empty);
export const fakeServiceCallback = foreign({ api, httpClient: () => Layer.empty });
`;
const valid = `import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Function from "effect/Function";
import * as Option from "effect/Option";

class Fixture extends Context.Service<Fixture, { readonly value: number }>()("Fixture") {}
export const plain = Layer.succeed(Fixture, { value: 1 });
export const curried = Layer.succeed(Fixture)({ value: 1 });
export const deferred = Layer.suspend(() => plain);
export const checked = Layer.unwrap(
  Effect.map(Effect.succeed(1), (value) => Layer.succeed(Fixture, { value })),
);
export const branches = Layer.unwrap(
  Effect.succeed(
    Option.match(Option.some(1), {
      onNone: () => Layer.empty,
      onSome: (value) => Layer.succeed(Fixture, { value }),
    }),
  ),
);
export const provided = plain.pipe(Layer.provide(Layer.empty));
export const functional = Function.pipe(plain, Layer.provide(Layer.empty));
export const mocked = Layer.mock(Fixture, { value: 2 });
export const build = () => plain.pipe(Layer.build);
export const createEffect = () => Effect.succeed(plain);
import { AtomHttpApi as Http } from "effect/reactivity";
import * as NativeHttp from "effect/reactivity/AtomHttpApi";
const service = Http.Service;
export class Api extends service<Api>()("Api", { api, httpClient: () => Layer.empty }) {}
export class Other extends NativeHttp.Service<Other>()("Other", { api, httpClient: () => plain }) {}
import * as NativeRpc from "effect/reactivity/AtomRpc";
export class Procedures extends NativeRpc.Service<Procedures>()("Procedures", { group, protocol: () => plain }) {}
`;
const shadowed = `import * as Layer from "effect/Layer";
const other = { succeed: () => "ordinary" };
export const staticLayer = Layer.empty;
export const shadowed = (Layer: typeof other) => Layer.succeed();
export const locallyShadowed = () => {
  const Layer = other;
  return Layer.succeed();
};
`;
it.effect(
  "rejects Layer factories at every owned code location",
  () =>
    Effect.forEach(
      targets,
      (target) =>
        Effect.gen(function* () {
          const result = yield* lint(invalid, target);
          expect(result.exitCode).not.toBe(0);
          expect(result.report.number_of_files).toBe(1);
          expect(result.report.diagnostics).toHaveLength(26);
          expect(
            Array.every<(typeof Report.Type)["diagnostics"][number]>(
              (diagnostic) => diagnostic.code === "strict-effect(static-layers)",
            )(result.report.diagnostics),
          ).toBe(true);
        }),
      { concurrency: 1 },
    ).pipe(Effect.provide(NodeServices.layer)),
  { timeout: 30_000 },
);
it.effect("accepts static composition, Effect callbacks and test replacements", () =>
  Effect.forEach(
    [valid, shadowed],
    (source) =>
      Effect.gen(function* () {
        const result = yield* lint(source, "apps/example/src/immutable.fixture.ts");
        expect(result.exitCode).toBe(0);
        expect(result.report.number_of_files).toBe(1);
        expect(result.report.diagnostics).toHaveLength(0);
      }),
    { concurrency: 1 },
  ).pipe(Effect.provide(NodeServices.layer)),
);
