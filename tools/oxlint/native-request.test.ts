import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
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
const FixtureTarget = Schema.Literals([
  "apps/web/src/lib/loader.ts",
  "apps/web/src/routes/example.tsx",
  "packages/domain/src/live.layer.ts",
  "apps/web/src/lib/reply.ts",
  "apps/web/src/lib/requests.ts",
]);
const root = new URL("../../", import.meta.url).pathname;
const lint = Effect.fnUntraced(function* (source: string, target: typeof FixtureTarget.Type) {
  const fs = yield* FileSystem.FileSystem;
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  return yield* Effect.scoped(
    Effect.gen(function* () {
      const temporary = yield* fs.makeTempDirectoryScoped({ prefix: "native-request-policy-" });
      const filename = `${temporary}/${target}`;
      yield* fs.makeDirectory(filename.slice(0, filename.lastIndexOf("/")), { recursive: true });
      yield* fs.writeFileString(filename, source);
      const configuration = `${temporary}/oxlint.json`;
      yield* fs.writeFileString(
        configuration,
        yield* Schema.encodeEffect(Configuration)({
          jsPlugins: [`${root}packages/oxlint-plugin/dist/strict-effect.js`],
          rules: {
            "strict-effect/no-loader-request-state": [
              "error",
              {
                loaderFiles: ["apps/web/src/lib/loader.ts"],
                clientServices: [{ module: "../lib/runtime.client", name: "ApiClient" }],
              },
            ],
            "strict-effect/no-native-client-replica": "error",
            "strict-effect/checked-page-response": [
              "error",
              {
                checkedHelper: { module: "apps/web/src/lib/requests", export: "requestPage" },
                responseSchema: { module: "@example/domain/schemas", export: "PageResponse" },
              },
            ],
            "strict-effect/native-cloudflare-cache": "error",
            "strict-effect/website-data-proxy": [
              "error",
              {
                websiteDirectory: "apps/web/src",
                publicApiPaths: ["/pages", "/courses", "/api/pages", "/api/courses"],
              },
            ],
          },
        }),
      );
      const handle = yield* spawner.spawn(
        ChildProcess.make(
          `${root}node_modules/.bin/oxlint`,
          ["--config", configuration, "--format", "json", target],
          { cwd: temporary, stdout: "pipe", stderr: "inherit" },
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
const rejectedLoaders = [
  'import * as Atom from "effect/reactivity/Atom"; export const load = () => Atom.make(read());',
  'import { Atom as State } from "effect/reactivity"; const { make: wrap } = State; export const load = () => wrap(read());',
  'import { Effect as Fx } from "effect"; const keep = Fx.cachedWithTTL; export const load = () => keep(read(), "1 minute");',
  'import * as Store from "effect/Cache"; export const load = () => Store.make({ lookup: read });',
] as const;
it.effect("loader owners reject result Atoms and caches through real imports and aliases", () =>
  Effect.forEach(
    rejectedLoaders,
    (source) =>
      lint(source, "apps/web/src/lib/loader.ts").pipe(
        Effect.tap(({ exitCode, report }) =>
          Effect.sync(() => {
            assert.notStrictEqual(exitCode, ChildProcessSpawner.ExitCode(0));
            assert.strictEqual(report.number_of_files, 1);
            assert.isTrue(
              Array.some(
                report.diagnostics,
                ({ code }) => code === "strict-effect(no-loader-request-state)",
              ),
            );
          }),
        ),
      ),
    { discard: true },
  ).pipe(Effect.provide(NodeServices.layer)),
);
it.effect(
  "native route loaders reject request state while component query Atoms remain allowed",
  () =>
    Effect.gen(function* () {
      const rejected = [
        'import { createFileRoute as route } from "@tanstack/react-router"; import { make as atom } from "effect/reactivity/Atom"; export const Route = route("/example")({ loader: () => atom(read()) });',
        'import { createRoute } from "@tanstack/react-router"; import { cached } from "effect/Effect"; const load = () => cached(read()); export const Route = createRoute({ loader: load });',
        'import { createFileRoute } from "@tanstack/react-router"; import { ApiClient as Client } from "../lib/runtime.client"; const query = Client.query; export const Route = createFileRoute("/example")({ loader: () => query("pages", "getPage", {}) });',
        'import { createFileRoute } from "@tanstack/react-router"; import * as Atom from "effect/reactivity/Atom"; import { ApiClient } from "../lib/runtime.client"; const page = ApiClient.query("pages", "getPage", {}); const alias = page; export const Route = createFileRoute("/example")({ loader: () => Atom.getResult(alias) });',
      ];
      yield* Effect.forEach(
        rejected,
        (source) =>
          lint(source, "apps/web/src/routes/example.tsx").pipe(
            Effect.tap(({ exitCode, report }) =>
              Effect.sync(() => {
                assert.notStrictEqual(exitCode, ChildProcessSpawner.ExitCode(0));
                assert.isTrue(
                  Array.some(
                    report.diagnostics,
                    ({ code }) => code === "strict-effect(no-loader-request-state)",
                  ),
                );
              }),
            ),
          ),
        { discard: true },
      );
      const accepted = yield* lint(
        'import { createFileRoute } from "@tanstack/react-router"; import * as Atom from "effect/reactivity/Atom"; import { ApiClient } from "../lib/runtime.client"; export const componentRead = ApiClient.query("pages", "getPage", {}); export const choice = Atom.make("light"); export const Route = createFileRoute("/example")({ loader: () => read() });',
        "apps/web/src/routes/example.tsx",
      );
      assert.strictEqual(accepted.exitCode, ChildProcessSpawner.ExitCode(0));
      assert.strictEqual(accepted.report.diagnostics.length, 0);
      const shadowed = yield* lint(
        'import * as Atom from "effect/reactivity/Atom"; export const load = (Atom) => Atom.make(read());',
        "apps/web/src/lib/loader.ts",
      );
      assert.strictEqual(shadowed.exitCode, ChildProcessSpawner.ExitCode(0));
    }).pipe(Effect.provide(NodeServices.layer)),
);
const replica = (method: string) =>
  `import { Layer, Effect, Context } from "effect"; import * as Api from "effect/http-api/HttpApiClient"; class Service extends Context.Service()("Service") {} export const live = Layer.effect(Service, Effect.gen(function* () { const client = yield* Api.make(contract); return Service.of({ getPage: ${method} }); }));`;
it.effect("service replicas fail while real timeout, input and result policy remains allowed", () =>
  Effect.gen(function* () {
    yield* Effect.forEach(
      [
        "client.pages.getPage",
        "(input) => client.pages.getPage(input)",
        "(input) => { return client.pages.getPage(input); }",
        'Effect.fn("Client.getPage")((input) => client.pages.getPage(input))',
        "Effect.fnUntraced((input) => client.pages.getPage(input))",
      ],
      (method) =>
        lint(replica(method), "packages/domain/src/live.layer.ts").pipe(
          Effect.tap(({ exitCode, report }) =>
            Effect.sync(() => {
              assert.notStrictEqual(exitCode, ChildProcessSpawner.ExitCode(0));
              assert.isTrue(
                Array.some(
                  report.diagnostics,
                  ({ code }) => code === "strict-effect(no-native-client-replica)",
                ),
              );
            }),
          ),
        ),
      { discard: true },
    );
    yield* Effect.forEach(
      [
        '(input) => client.pages.getPage(input).pipe(Effect.timeout("40 seconds"))',
        "(input) => client.pages.getPage(input).pipe(Effect.map(selectFeature))",
        '() => client.pages.getPage({ params: { id: "home" } })',
        '() => { return client.pages.getPage({ params: { id: "home" } }); }',
      ],
      (method) =>
        lint(replica(method), "packages/domain/src/live.layer.ts").pipe(
          Effect.tap(({ exitCode, report }) =>
            Effect.sync(() => {
              assert.strictEqual(exitCode, ChildProcessSpawner.ExitCode(0));
              assert.strictEqual(report.diagnostics.length, 0);
            }),
          ),
        ),
      { discard: true },
    );
  }).pipe(Effect.provide(NodeServices.layer)),
);

const policyDiagnostics = (report: typeof Report.Type, rule: string) =>
  Array.filter(report.diagnostics, ({ code }) => code === `strict-effect(${rule})`).length;
const diagnosticCodes = (report: typeof Report.Type) =>
  Array.join(
    Array.map(report.diagnostics, ({ code }) => code),
    ", ",
  );

it.effect(
  "checked reply enforcement follows imported helpers, values and native Effect callbacks",
  () =>
    Effect.gen(function* () {
      const rejected = [
        {
          source:
            'import * as Effect from "effect/Effect"; import * as Schema from "effect/Schema"; import { PageResponse as Reply } from "@example/domain/schemas"; import { requestPage as checked } from "./requests"; const request = checked; const decode = Schema.decodeEffect; export const read = Effect.fn("Example.read")(function* () { const reply = yield* request({ client, input: { id, format: "data" } }); const alias = reply; if (alias.format !== "data") return false; return yield* decode(Reply)(alias); });',
          count: 2,
        },
        {
          source:
            'import * as Requests from "./requests"; import { Effect } from "effect"; export const read = Effect.fn("Example.read")(function* () { const reply = yield* Requests.requestPage({ client, input: { id, format: "seo" } }); return "seo" === reply.format; });',
          count: 1,
        },
        {
          source:
            'import { requestPage } from "./requests"; import { map } from "effect/Effect"; export const read = requestPage({ client, input: { id, format: "markdown" } }).pipe(map((reply) => reply.format === "markdown"));',
          count: 1,
        },
        {
          source:
            'import { requestPage } from "./requests"; import * as Effect from "effect/Effect"; export const read = Effect.map(requestPage({ client, input: { id, format: "og" } }), (reply) => reply.format === "og");',
          count: 1,
        },
        {
          source:
            'import { requestPage } from "./requests"; import * as Schema from "effect/Schema"; import * as Domain from "@example/domain/schemas"; import * as Effect from "effect/Effect"; const { decodeEffect: decode } = Schema; export const read = Effect.fn("Example.read")(function* () { const reply = yield* requestPage({ client, input: { id, format } }); return yield* decode(Domain.PageResponse)(reply); });',
          count: 1,
        },
      ];
      yield* Effect.forEach(
        rejected,
        ({ source, count }) =>
          lint(source, "apps/web/src/lib/reply.ts").pipe(
            Effect.tap(({ exitCode, report }) =>
              Effect.sync(() => {
                assert.notStrictEqual(exitCode, ChildProcessSpawner.ExitCode(0));
                assert.strictEqual(report.number_of_files, 1);
                assert.strictEqual(policyDiagnostics(report, "checked-page-response"), count);
              }),
            ),
          ),
        { discard: true },
      );
      yield* Effect.forEach(
        [
          'import { requestPage } from "./requests"; import * as Effect from "effect/Effect"; export const read = Effect.fn("Example.read")(function* () { const reply = yield* requestPage({ client, input: { id, format: "data" } }); return reply.page.path === expectedPath && reply.page.title === expectedTitle; });',
          'import { requestPage } from "./requests"; import * as Effect from "effect/Effect"; export const read = (format) => requestPage({ client, input: { id, format } }).pipe(Effect.map((reply) => reply.format === "data"));',
          'import { requestPage } from "other-client"; import * as Effect from "effect/Effect"; export const read = Effect.fn("Example.read")(function* () { const reply = yield* requestPage({ client, input: { id, format: "data" } }); return reply.format === "data"; });',
          'import { requestPage } from "./requests"; import * as Effect from "effect/Effect"; export const native = requestPage({ client, input: { id, format: "data" } }); export const read = (requestPage) => Effect.gen(function* () { const reply = yield* requestPage({ client, input: { id, format: "data" } }); return reply.format === "data"; });',
          'import * as Schema from "effect/Schema"; import { PageResponse } from "@example/domain/schemas"; export const read = (raw) => Schema.decodeEffect(PageResponse)(raw);',
        ],
        (source) =>
          lint(source, "apps/web/src/lib/reply.ts").pipe(
            Effect.tap(({ exitCode, report }) =>
              Effect.sync(() => {
                assert.strictEqual(exitCode, ChildProcessSpawner.ExitCode(0));
                assert.strictEqual(report.diagnostics.length, 0, diagnosticCodes(report));
              }),
            ),
          ),
        { discard: true },
      );
      const owner = yield* lint(
        'import * as Effect from "effect/Effect"; export const requestPage = ({ client, input }) => client.pages.getPage(input).pipe(Effect.filterOrFail((reply) => reply.format === input.format, invalidReply));',
        "apps/web/src/lib/requests.ts",
      );
      assert.strictEqual(owner.exitCode, ChildProcessSpawner.ExitCode(0));
      assert.strictEqual(owner.report.diagnostics.length, 0);
    }).pipe(Effect.provide(NodeServices.layer)),
);

it.effect(
  "native Cloudflare caching rejects global storage but preserves local values and native cache owners",
  () =>
    Effect.gen(function* () {
      yield* Effect.forEach(
        [
          "export const read = () => caches.default.match(url);",
          'export const read = () => caches.open("pages");',
          "export const read = () => globalThis.caches.default.put(url, response);",
          "const store = caches.default; const alias = store; export const read = () => alias.match(url);",
          'const globals = globalThis; export const read = () => globals.caches.open("pages");',
          "const { caches: store } = globalThis; export const read = () => store.match(url);",
          'export const read = () => globalThis["caches"].default.match(url);',
        ],
        (source) =>
          lint(source, "packages/domain/src/live.layer.ts").pipe(
            Effect.tap(({ exitCode, report }) =>
              Effect.sync(() => {
                assert.notStrictEqual(exitCode, ChildProcessSpawner.ExitCode(0));
                assert.strictEqual(report.number_of_files, 1);
                assert.isAtLeast(policyDiagnostics(report, "native-cloudflare-cache"), 1);
              }),
            ),
          ),
        { discard: true },
      );
      yield* Effect.forEach(
        [
          'import * as Cloudflare from "alchemy/Cloudflare"; import * as Effect from "effect/Effect"; export const cache = Cloudflare.cache({ crossVersionCache: false }); export const purge = Effect.fn("Example.purge")(function* () { const client = yield* Cloudflare.cache(); return yield* client.purge({ tags: ["pages"] }); });',
          'import * as Cache from "effect/Cache"; import * as Effect from "effect/Effect"; export const imageCache = Cache.make({ capacity: 1, lookup: (id) => Effect.succeed(id) });',
          'export const read = (caches) => caches.match(url); export const local = { caches: "configuration" };',
          'const caches = "console"; export const read = () => globalThis[caches];',
        ],
        (source) =>
          lint(source, "packages/domain/src/live.layer.ts").pipe(
            Effect.tap(({ exitCode, report }) =>
              Effect.sync(() => {
                assert.strictEqual(exitCode, ChildProcessSpawner.ExitCode(0));
                assert.strictEqual(report.number_of_files, 1);
                assert.strictEqual(report.diagnostics.length, 0, diagnosticCodes(report));
              }),
            ),
          ),
        { discard: true },
      );
    }).pipe(Effect.provide(NodeServices.layer)),
);

it.effect(
  "Website public data proxies fail while native HTML and download handlers remain allowed",
  () =>
    Effect.gen(function* () {
      yield* Effect.forEach(
        [
          'import { createFileRoute as route } from "@tanstack/react-router"; export const Route = route("/pages")({ server: { handlers: { GET: read } } });',
          'import * as Router from "@tanstack/react-router"; export const Route = Router.createFileRoute("/courses/$id")({ server: { handlers: { GET: read } } });',
          'import { createFileRoute } from "@tanstack/react-router"; const route = createFileRoute; const path = "/api/" + "pages/$id"; const server = { handlers: { GET: read } }; const options = { server }; export const Route = route(path)(options);',
          'import { createRoute } from "@tanstack/react-router"; export const Route = createRoute({ path: "/api/courses", server: { handlers: { GET: read } } });',
        ],
        (source) =>
          lint(source, "apps/web/src/routes/example.tsx").pipe(
            Effect.tap(({ exitCode, report }) =>
              Effect.sync(() => {
                assert.notStrictEqual(exitCode, ChildProcessSpawner.ExitCode(0));
                assert.strictEqual(report.number_of_files, 1);
                assert.strictEqual(policyDiagnostics(report, "website-data-proxy"), 1);
              }),
            ),
          ),
        { discard: true },
      );
      yield* Effect.forEach(
        [
          'import { createFileRoute } from "@tanstack/react-router"; export const Route = createFileRoute("/about.md")({ server: { handlers: { GET: read } } });',
          'import { createFileRoute } from "@tanstack/react-router"; export const Route = createFileRoute("/about.og")({ server: { handlers: { GET: read } } });',
          'import { createFileRoute } from "@tanstack/react-router"; export const Route = createFileRoute("/.well-known/mcp.json")({ server: { handlers: { GET: read } } });',
          'import { createFileRoute } from "@tanstack/react-router"; export const Route = createFileRoute("/ingest/$")({ server: { handlers: { GET: read } } });',
          'import { createFileRoute } from "@tanstack/react-router"; export const Route = createFileRoute("/pages")({ loader: read });',
          'import { createFileRoute } from "@tanstack/react-router"; export const Route = createFileRoute("/pages-of-practice")({ server: { handlers: { GET: read } } });',
          'import { createFileRoute } from "@tanstack/react-router"; export const native = createFileRoute("/about")({ loader: read }); export const make = (createFileRoute) => createFileRoute("/api/pages")({ server: { handlers: { GET: read } } });',
        ],
        (source) =>
          lint(source, "apps/web/src/routes/example.tsx").pipe(
            Effect.tap(({ exitCode, report }) =>
              Effect.sync(() => {
                assert.strictEqual(exitCode, ChildProcessSpawner.ExitCode(0));
                assert.strictEqual(report.diagnostics.length, 0, diagnosticCodes(report));
              }),
            ),
          ),
        { discard: true },
      );
    }).pipe(Effect.provide(NodeServices.layer)),
);

it.effect("native HTTP aggregate imports also reject service replicas", () =>
  lint(
    'import { Layer, Effect, Context } from "effect"; import { HttpApiClient } from "effect/http-api"; class Service extends Context.Service()("Service") {} export const live = Layer.effect(Service, Effect.gen(function* () { const client = yield* HttpApiClient.make(contract); return Service.of({ getPage: (input) => client.pages.getPage(input) }); }));',
    "packages/domain/src/live.layer.ts",
  ).pipe(
    Effect.tap(({ exitCode, report }) =>
      Effect.sync(() => {
        assert.notStrictEqual(exitCode, ChildProcessSpawner.ExitCode(0));
        assert.strictEqual(policyDiagnostics(report, "no-native-client-replica"), 1);
      }),
    ),
    Effect.provide(NodeServices.layer),
  ),
);

it.effect("a local globalThis parameter cannot borrow the actual Cache API identity", () =>
  lint(
    'export const read = (globalThis) => globalThis.caches.open("pages");',
    "packages/domain/src/live.layer.ts",
  ).pipe(
    Effect.tap(({ exitCode, report }) =>
      Effect.sync(() => {
        assert.strictEqual(exitCode, ChildProcessSpawner.ExitCode(0));
        assert.strictEqual(policyDiagnostics(report, "native-cloudflare-cache"), 0);
        // The ordinary restricted-name warning remains; this policy adds no cache error.
        assert.isTrue(
          Array.every(
            report.diagnostics,
            ({ code }) => code === "eslint(no-shadow-restricted-names)",
          ),
        );
      }),
    ),
    Effect.provide(NodeServices.layer),
  ),
);
