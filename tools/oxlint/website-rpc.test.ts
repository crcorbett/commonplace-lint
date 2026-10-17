import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { Array, Effect, FileSystem, Schema, Stream } from "effect";
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
const lint = Effect.fnUntraced(function* (
  source: string,
  target = "apps/web/src/lib/data.ts",
  registryTests: readonly string[] = [],
) {
  const fs = yield* FileSystem.FileSystem;
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  return yield* Effect.scoped(
    Effect.gen(function* () {
      const temporary = yield* fs.makeTempDirectoryScoped({ prefix: "website-rpc-" });
      const filename = `${temporary}/${target}`;
      yield* fs.makeDirectory(filename.slice(0, filename.lastIndexOf("/")), { recursive: true });
      yield* fs.writeFileString(filename, source);
      const configuration = `${temporary}/oxlint.json`;
      yield* fs.writeFileString(
        configuration,
        yield* Schema.encodeEffect(Configuration)({
          jsPlugins: [`${root}packages/oxlint-plugin/dist/strict-effect.js`],
          rules: {
            "strict-effect/website-rpc-boundary": [
              "error",
              {
                serverRuntime: "apps/web/src/lib/runtime.server.ts",
                browserRuntime: "apps/web/src/lib/runtime.client.ts",
                registryTests,
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
      const result = yield* Effect.all(
        {
          exitCode: handle.exitCode,
          stdout: handle.stdout.pipe(
            Stream.decodeText,
            Stream.runFold(
              () => "",
              (text, chunk) => text + chunk,
            ),
          ),
          stderr: handle.stderr.pipe(
            Stream.decodeText,
            Stream.runFold(
              () => "",
              (text, chunk) => text + chunk,
            ),
          ),
        },
        { concurrency: "unbounded" },
      );
      return {
        exitCode: result.exitCode,
        report: yield* Schema.decodeEffect(Report)(result.stdout),
      };
    }),
  );
});

const rejected = [
  'import { loadPage } from "./runtime.server"; export { loadPage };',
  'import { loadPage } from "./runtime.server"; export const loader = loadPage;',
  'import { loadPage } from "./runtime.server"; export const route = { loader: loadPage };',

  'import * as server from "./runtime.server"; export const read = fake.server(() => server.load());',
  'import { createServerFn as remote } from "@tanstack/react-start"; export const load = remote({ method: "GET" });',
  'import * as Start from "@tanstack/react-start"; const { createServerFn: remote } = Start; export const load = remote({ method: "GET" });',
  'import * as Start from "@tanstack/react-start"; const alias = Start.createServerFn; export const load = alias({ method: "GET" });',
  'export { createServerFn as load } from "@tanstack/react-start";',
  'export * from "@tanstack/react-start";',
  'import * as Atom from "effect/reactivity/Atom"; const make = Atom.runtime; export const extra = make(layer);',
  'import { Atom as State } from "effect/reactivity"; export const extra = State.runtime(layer);',
  'import { make as create } from "effect/ManagedRuntime"; export const extra = create(layer);',
  'import * as RpcClient from "effect/rpc/RpcClient"; export const client = RpcClient.make(group);',
  'import * as Rpc from "effect/reactivity/AtomRpc"; export const Client = Rpc.Service()("Client", { group, protocol: layer, runtime: browserRuntime.factory });',
  'import * as Http from "effect/reactivity/AtomHttpApi"; export class Client extends Http.Service()("Client", { runtime: browserRuntime.factory }) {}',
  'import { loadPage as read } from "./runtime.server"; export const load = () => read();',
  'import { loadPage as read } from "./runtime.client"; export const load = () => read();',
  'export { loadPage } from "./runtime.server";',
  'export * from "./runtime.client";',
  'import { createFileRoute as route } from "@tanstack/react-router"; export const Route = route("/rpc")({});',
] as const;
const accepted = [
  'import { createServerOnlyFn } from "@tanstack/react-start"; import { loadPage } from "./runtime.server"; export const handler = createServerOnlyFn(loadPage);',

  'import { createIsomorphicFn } from "@tanstack/react-start"; import * as server from "./runtime.server"; import * as browser from "./runtime.client"; export const read = createIsomorphicFn().server(() => server.load()).client(() => browser.load());',
  'import { HttpClient } from "effect/http"; export const download = HttpClient.get("https://example.com/file");',
  'import { Atom } from "effect/reactivity"; export const local = Atom.make(0);',
  'import type { Input } from "./runtime.server"; export type Args = Input;',
  'import * as Start from "@tanstack/react-start"; export const outside = Start.createIsomorphicFn; export const call = (Start: { createServerFn: () => number }) => Start.createServerFn();',
] as const;

describe("Website RPC boundary", () => {
  it.effect(
    "rejects alternate transports, aliases, re-exports and extra runtimes through Oxlint",
    () =>
      Effect.forEach(
        rejected,
        (source) =>
          lint(source).pipe(
            Effect.tap((result) =>
              Effect.sync(() => {
                expect(result.exitCode, source).toBe(1);
                expect(
                  Array.some(
                    result.report.diagnostics,
                    ({ code }) => code === "strict-effect(website-rpc-boundary)",
                  ),
                  source,
                ).toBe(true);
              }),
            ),
          ),
        { concurrency: 1, discard: true },
      ).pipe(Effect.provide(NodeServices.layer)),
    60_000,
  );
  it.effect("allows matching environment functions and genuine HTTP work", () =>
    Effect.forEach(
      accepted,
      (source) =>
        lint(source).pipe(
          Effect.tap((result) =>
            Effect.sync(() => {
              expect(result.exitCode, source).toBe(0);
              expect(result.report.diagnostics, source).toEqual([]);
            }),
          ),
        ),
      { concurrency: 1, discard: true },
    ).pipe(Effect.provide(NodeServices.layer)),
  );
  it.effect("allows exactly the named runtime at each composition owner", () =>
    Effect.gen(function* () {
      const browser = yield* lint(
        'import { Atom } from "effect/reactivity"; export const browserRuntime = Atom.runtime(layer);',
        "apps/web/src/lib/runtime.client.ts",
      );
      const server = yield* lint(
        'import { ManagedRuntime } from "effect"; const runtime = ManagedRuntime.make(layer);',
        "apps/web/src/lib/runtime.server.ts",
      );
      const duplicate = yield* lint(
        'import { Atom } from "effect/reactivity"; export const browserRuntime = Atom.runtime(layer); export const extra = Atom.runtime(layer);',
        "apps/web/src/lib/runtime.client.ts",
      );
      expect(browser.exitCode).toBe(0);
      expect(server.exitCode).toBe(0);
      expect(duplicate.exitCode).toBe(1);
    }).pipe(Effect.provide(NodeServices.layer)),
  );
});

it.effect("native HTTP and RPC Service factories share the owned browser runtime", () =>
  Effect.forEach(
    ["AtomHttpApi", "AtomRpc"],
    (module) =>
      lint(
        `import * as Native from "effect/reactivity/${module}"; export class Client extends Native.Service()("Client", { ${module === "AtomHttpApi" ? "api, httpClient: layer" : "group, protocol: layer"}, runtime: browserRuntime.factory }) {}`,
        "apps/web/src/lib/runtime.client.ts",
      ).pipe(
        Effect.tap((result) =>
          Effect.sync(() => {
            expect(result.exitCode).toBe(0);
            expect(result.report.diagnostics).toHaveLength(0);
          }),
        ),
      ),
    { discard: true },
  ).pipe(Effect.provide(NodeServices.layer)),
);

it.effect("registry construction belongs only to the browser owner or exact test paths", () =>
  Effect.gen(function* () {
    const good = yield* lint(
      'import { AtomRegistry } from "effect/reactivity"; export const createLoaderRegistry = () => AtomRegistry.make();',
      "apps/web/src/lib/runtime.client.ts",
    );
    expect(good.exitCode).toBe(0);
    const cases = [
      [
        "apps/web/src/lib/runtime.client.ts",
        'import { AtomRegistry } from "effect/reactivity"; export const extraRegistry = () => AtomRegistry.make();',
        [],
      ],
      [
        "apps/web/src/lib/data.ts",
        'import { make as create } from "effect/reactivity/AtomRegistry"; export const extraRegistry = () => create();',
        [],
      ],
      [
        "apps/web/src/lib/data.ts",
        'import { make as create } from "effect/reactivity/AtomRegistry"; export const makeRegistry = create;',
        [],
      ],
      [
        "apps/web/src/lib/data.ts",
        'import * as Registry from "effect/reactivity/AtomRegistry"; export const makeRegistry = Registry.make;',
        [],
      ],
      [
        "apps/web/src/lib/data.ts",
        'import { AtomRegistry } from "effect/reactivity"; export const createLoaderRegistry = () => AtomRegistry.make();',
        [],
      ],
      [
        "apps/web/src/lib/other.test.ts",
        'import { AtomRegistry } from "effect/reactivity"; const registry = AtomRegistry.make();',
        ["apps/web/src/lib/registry.test.ts"],
      ],
      [
        "apps/web/src/lib/registry.test.ts",
        'import { AtomRegistry } from "effect/reactivity"; const registry = AtomRegistry.make();',
        ["apps/web/src/lib/*.test.ts"],
      ],
      [
        "apps/web/src/lib/registry.test.ts",
        'import { AtomRegistry } from "effect/reactivity"; const registry = AtomRegistry.make();',
        ["apps/web/src/lib/../lib/registry.test.ts"],
      ],
      [
        "apps/web/src/lib/registry.ts",
        'import { AtomRegistry } from "effect/reactivity"; const registry = AtomRegistry.make();',
        ["apps/web/src/lib/registry.ts"],
      ],
    ] satisfies ReadonlyArray<readonly [string, string, readonly string[]]>;
    yield* Effect.forEach(
      cases,
      ([target, source, tests]) =>
        Effect.gen(function* () {
          const result = yield* lint(source, target, tests);
          expect(result.exitCode, target + source).toBe(1);
        }),
      { discard: true },
    );
    yield* Effect.forEach(
      ["registry.test.ts", "registry.spec.tsx"],
      (name) =>
        Effect.gen(function* () {
          const target = "apps/web/src/lib/" + name;
          const result = yield* lint(
            'import { AtomRegistry } from "effect/reactivity"; const registry = AtomRegistry.make();',
            target,
            [target],
          );
          expect(result.exitCode).toBe(0);
        }),
      { discard: true },
    );
  }).pipe(Effect.provide(NodeServices.layer)),
);
