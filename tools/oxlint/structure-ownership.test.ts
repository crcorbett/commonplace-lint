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

// Runs the actual Oxlint command over one file written at `target` inside a
// temporary working directory, so exact owner paths resolve as they would in a
// receiving repository.
const lint = Effect.fnUntraced(function* (
  rule: string,
  options: Schema.Json,
  source: string,
  target: string,
) {
  const fs = yield* FileSystem.FileSystem;
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  return yield* Effect.scoped(
    Effect.gen(function* () {
      const temporary = yield* fs.makeTempDirectoryScoped({ prefix: "structure-ownership-" });
      const filename = `${temporary}/${target}`;
      yield* fs.makeDirectory(filename.slice(0, filename.lastIndexOf("/")), { recursive: true });
      yield* fs.writeFileString(filename, source);
      const configuration = `${temporary}/oxlint.json`;
      yield* fs.writeFileString(
        configuration,
        yield* Schema.encodeEffect(Configuration)({
          jsPlugins: [`${root}packages/oxlint-plugin/dist/strict-effect.js`],
          rules: { [`strict-effect/${rule}`]: ["error", options] },
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
      const report = yield* Schema.decodeEffect(Report)(result.stdout);
      return {
        exitCode: result.exitCode,
        files: report.number_of_files,
        count: Array.filter(report.diagnostics, ({ code }) => code === `strict-effect(${rule})`)
          .length,
      };
    }),
  );
});

interface Case {
  readonly rule: string;
  readonly options: Schema.Json;
  readonly owner: string;
  readonly neighbour: string;
  readonly rejected: ReadonlyArray<string>;
  readonly accepted: ReadonlyArray<string>;
  readonly testFilesAllowed: boolean;
}

const cases: ReadonlyArray<Case> = [
  {
    rule: "public-host-literals",
    options: {
      hosts: ["example.com"],
      allowedFiles: ["packages/infrastructure/src/hostnames.ts"],
      allowTestFiles: true,
    },
    owner: "packages/infrastructure/src/hostnames.ts",
    neighbour: "packages/infrastructure/src/hostnames.helper.ts",
    rejected: [
      'export const home = "https://example.com/about";',
      "export const tracking = (stage: string) => `https://${stage}.example.com`;",
      'export const host = "go.example.com";',
      "export const canonical = /^https:\\/\\/example\\.com\\//u;",
      'export const contact = "hello@example.com";',
      'export const upper = "https://EXAMPLE.COM";',
    ],
    accepted: [
      'export const other = "https://notexample.com";',
      'export const longer = "https://example.community";',
      'export const word = "example";',
      "export const origin = (base: string) => `${base}/about`;",
    ],
    testFilesAllowed: true,
  },
  {
    rule: "route-literal-ownership",
    options: {
      prefixes: ["/.well-known", "/pages/"],
      allowedFiles: ["packages/http/src/routes.ts"],
      allowTestFiles: false,
    },
    owner: "packages/http/src/routes.ts",
    neighbour: "apps/web/src/lib/forward.ts",
    rejected: [
      'export const catalogue = "/.well-known/api-catalog";',
      "export const page = (id: string) => `/pages/${id}`;",
      "export const url = (origin: string) => `${origin}/pages`;",
      'export const list = "/pages";',
      'export const query = "/pages?limit=1";',
      'const createFileRoute = (path: string) => path; export const local = createFileRoute("/pages");',
    ],
    accepted: [
      'export const other = "/pagesx";',
      'export const about = "/about";',
      'import { createFileRoute } from "@tanstack/react-router"; export const Route = createFileRoute("/.well-known/mcp.json");',
      'export const relative = "pages/home";',
    ],
    testFilesAllowed: false,
  },
  {
    rule: "http-client-ownership",
    options: { allowedFiles: ["packages/analytics/src/capture-client.layer.ts"] },
    owner: "packages/analytics/src/capture-client.layer.ts",
    neighbour: "apps/api/src/worker.ts",
    rejected: [
      'import * as FetchHttpClient from "effect/http/FetchHttpClient"; export const client = FetchHttpClient.layer;',
      'import { FetchHttpClient } from "effect/http"; export const settings = FetchHttpClient.RequestInit;',
      'import { layer } from "effect/http/FetchHttpClient"; export const client = layer;',
      'import * as FetchHttpClient from "effect/http/FetchHttpClient"; const Fetch = FetchHttpClient; export const client = Fetch.layer;',
    ],
    accepted: [
      'import * as HttpClient from "effect/http/HttpClient"; export const client = HttpClient.HttpClient;',
      'import type * as FetchHttpClient from "effect/http/FetchHttpClient"; export type Settings = typeof FetchHttpClient.RequestInit;',
      "const FetchHttpClient = { layer: 1 }; export const local = FetchHttpClient.layer;",
    ],
    testFilesAllowed: false,
  },
  {
    rule: "worker-settings-ownership",
    options: {
      properties: ["compatibility", "observability", "dev", "name"],
      allowedFiles: ["packages/infrastructure/src/cloudflare/workers.ts"],
    },
    owner: "packages/infrastructure/src/cloudflare/workers.ts",
    neighbour: "apps/api/src/deployment/worker.ts",
    rejected: [
      'export const props = { compatibility: { date: "2026-09-22", flags: ["nodejs_compat"] } };',
      "export const props = (stage: string) => ({ name: `site-${stage}-api` });",
      "export const props = { dev: { port: 3211 } };",
      "export const props = { observability: { enabled: true } };",
      'export const props = (stage: string) => ({ name: "site-" + stage });',
    ],
    accepted: [
      "const workerCompatibility = () => ({}); export const props = { compatibility: workerCompatibility() };",
      "const workerName = (stage: string) => stage; export const props = (stage: string) => ({ name: workerName(stage) });",
      "const base = {}; export const props = { ...base, main: import.meta.url };",
      "export const read = (input: { name: string }) => { const { name } = input; return name; };",
    ],
    testFilesAllowed: false,
  },
  {
    rule: "no-owner-paths-in-rules",
    options: { roots: ["apps", "packages"] },
    owner: "",
    neighbour: "tools/oxlint/rules/example-rule.ts",
    rejected: [
      'export const owner = "apps/web/src/lib/runtime.client.ts";',
      'export const message = "Construct the runtime only in apps/web/src/lib/runtime.client.ts.";',
      "export const owner = `/packages/og-image/src/takumi.adapter.layer.ts`;",
      'export const root = "/apps/web/src/routes/__root.tsx";',
    ],
    accepted: [
      'export const roots = ["apps", "packages"];',
      'export const message = "Read owners from the configured options.";',
      'export const folder = "packages/";',
      'export const module = "effect/Schema";',
    ],
    testFilesAllowed: false,
  },
];

const checkCase = Effect.fnUntraced(function* (entry: Case) {
  yield* Effect.forEach(
    entry.rejected,
    (source) =>
      Effect.gen(function* () {
        const result = yield* lint(entry.rule, entry.options, source, entry.neighbour);
        expect(result.files, source).toBe(1);
        expect(result.exitCode, source).toBe(1);
        expect(result.count, source).toBeGreaterThan(0);
        if (entry.owner !== "") {
          const owner = yield* lint(entry.rule, entry.options, source, entry.owner);
          expect(owner.count, `${source} at owner`).toBe(0);
        }
        const test = yield* lint(
          entry.rule,
          entry.options,
          source,
          entry.neighbour.replace(/\.ts$/u, ".test.ts"),
        );
        expect(test.count === 0, `${source} in a test file`).toBe(entry.testFilesAllowed);
      }),
    { concurrency: 1, discard: true },
  );
  yield* Effect.forEach(
    entry.accepted,
    (source) =>
      Effect.gen(function* () {
        const result = yield* lint(entry.rule, entry.options, source, entry.neighbour);
        expect(result.files, source).toBe(1);
        expect(result.count, source).toBe(0);
      }),
    { concurrency: 1, discard: true },
  );
});

describe("structure ownership rules", () => {
  Array.forEach(cases, (entry) => {
    it.effect(
      `${entry.rule} rejects neighbours and accepts owners and checked sources`,
      () => checkCase(entry).pipe(Effect.provide(NodeServices.layer)),
      120_000,
    );
  });

  it.effect(
    "public-host-literals checks JSX text",
    () =>
      Effect.gen(function* () {
        const result = yield* lint(
          "public-host-literals",
          { hosts: ["example.com"], allowedFiles: [], allowTestFiles: false },
          "export const Contact = () => <p>Write to hello@example.com today.</p>;",
          "apps/web/src/components/contact.tsx",
        );
        expect(result.count).toBe(1);
      }).pipe(Effect.provide(NodeServices.layer)),
    60_000,
  );

  it.effect(
    "owner paths must be exact, relative and without wildcards",
    () =>
      Effect.gen(function* () {
        const source = 'export const home = "https://example.com";';
        const target = "packages/infrastructure/src/hostnames.ts";
        const wildcard = yield* lint(
          "public-host-literals",
          {
            hosts: ["example.com"],
            allowedFiles: ["packages/*/src/hostnames.ts"],
            allowTestFiles: false,
          },
          source,
          target,
        );
        expect(wildcard.count).toBe(1);
        const parent = yield* lint(
          "public-host-literals",
          {
            hosts: ["example.com"],
            allowedFiles: ["../packages/infrastructure/src/hostnames.ts"],
            allowTestFiles: false,
          },
          source,
          target,
        );
        expect(parent.count).toBe(1);
      }).pipe(Effect.provide(NodeServices.layer)),
    60_000,
  );
});
