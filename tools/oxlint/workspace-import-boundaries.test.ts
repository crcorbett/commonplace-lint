import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { Array, Effect, FileSystem, Option, Schema, Stream } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/process";

const repository = new URL("../../", import.meta.url).pathname;
const realCommandTimeout = 60_000;
const rule = "package(workspace-import-boundaries)";
const Report = Schema.fromJsonString(
  Schema.Struct({
    diagnostics: Schema.Array(Schema.Struct({ code: Schema.String, filename: Schema.String })),
    number_of_files: Schema.Int,
  }),
);
const Configuration = Schema.fromJsonString(
  Schema.Struct({
    jsPlugins: Schema.Array(Schema.String),
    rules: Schema.Record(Schema.String, Schema.Json),
  }),
);
const policy = {
  owners: [
    { id: "root", root: "." },
    { id: "site", root: "apps/site" },
    { id: "api", root: "apps/api" },
    { id: "domain", root: "packages/domain" },
    { id: "ui", root: "packages/ui" },
    { id: "one", root: "a" },
  ],
  workspaces: [
    { name: "@repo/site", owner: "site", exports: { "./resource": true } },
    { name: "@repo/api", owner: "api", exports: { ".": false, "./resource": true } },
    {
      name: "@repo/domain",
      owner: "domain",
      exports: {
        ".": true,
        "./service": true,
        "./features/*": true,
        "./features/private/*": false,
        "./features/private/open": true,
        "./features/*.json": false,
        "./features/*.special.json": true,
        "./features/fixed": false,
      },
    },
    { name: "@repo/ui", owner: "ui", exports: { ".": true, "./view": true } },
    { name: "single", owner: "one", exports: { ".": true } },
  ],
  workspacePrefixes: ["@repo/", "single"],
  forbiddenEdges: [
    { from: "site", to: "domain" },
    { from: "site", to: "api" },
    { from: "domain", to: "api" },
    { from: "api", to: "site" },
    { from: "root", to: "site" },
  ],
  exceptions: [{ fromFile: "apps/api/src/resource.layer.ts", toModule: "@repo/site/resource" }],
  aliases: [
    { prefix: "@local/", root: "apps/site/src" },
    { prefix: "#/", root: "packages/domain/src" },
  ],
};
interface Fixture {
  readonly file: string;
  readonly source: string;
}
const readText = <E>(stream: Stream.Stream<Uint8Array, E>) =>
  stream.pipe(
    Stream.decodeText,
    Stream.runFold(
      () => "",
      (text, chunk) => text + chunk,
    ),
  );
const lint = Effect.fnUntraced(function* (
  fixtures: readonly Fixture[],
  options: Schema.Json = policy,
) {
  const fs = yield* FileSystem.FileSystem;
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  return yield* Effect.scoped(
    Effect.gen(function* () {
      const temporaryDirectory = yield* fs.makeTempDirectoryScoped({
        prefix: "workspace-boundaries-",
      });
      // Oxlint resolves macOS temporary-directory aliases before reporting paths.
      const directory = yield* fs.realPath(temporaryDirectory);
      yield* Effect.forEach(
        fixtures,
        (fixture) =>
          Effect.gen(function* () {
            const filename = `${directory}/${fixture.file}`;
            yield* fs.makeDirectory(filename.slice(0, filename.lastIndexOf("/")), {
              recursive: true,
            });
            yield* fs.writeFileString(filename, fixture.source.replaceAll("$REPO", directory));
          }),
        { discard: true },
      );
      const config = `${directory}/oxlint.json`;
      yield* fs.writeFileString(
        config,
        yield* Schema.encodeEffect(Configuration)({
          jsPlugins: [`${repository}packages/oxlint-plugin/dist/package.js`],
          rules: { "package/workspace-import-boundaries": ["error", options] },
        }),
      );
      const handle = yield* spawner.spawn(
        ChildProcess.make(
          `${repository}node_modules/.bin/oxlint`,
          ["--config", config, "--format", "json", ...Array.map(fixtures, ({ file }) => file)],
          { cwd: directory, stdout: "pipe", stderr: "pipe" },
        ),
      );
      const result = yield* Effect.all(
        {
          exitCode: handle.exitCode,
          stdout: readText(handle.stdout),
          stderr: readText(handle.stderr),
        },
        { concurrency: "unbounded" },
      );
      return { ...result, report: Schema.decodeOption(Report)(result.stdout) };
    }),
  );
});

const rejected: readonly Fixture[] = [
  {
    file: "apps/api/src/queried-cross.ts",
    source: 'import "../../../packages/domain/asset.txt?raw";',
  },
  { file: "apps/api/src/relative.ts", source: 'import "../../../packages/domain/src/service";' },
  { file: "apps/api/src/root-entry.ts", source: 'export * from "../../../packages/domain";' },
  {
    file: "apps/api/src/non-src.ts",
    source: 'export { value } from "../../../packages/domain/test/fixture";',
  },
  { file: "root-entry.ts", source: 'import "./packages/domain";' },
  { file: "tools/root-owner.ts", source: 'import "../packages/domain/index";' },
  { file: "apps/api/src/private.ts", source: 'import "@repo/domain/internal";' },
  { file: "apps/api/src/private-src.ts", source: 'import "@repo/domain/src/service";' },
  { file: "apps/api/src/unknown.ts", source: 'import "@repo/missing/service";' },
  { file: "apps/api/src/null-root.ts", source: 'import "@repo/api";' },
  {
    file: "apps/api/src/null-pattern.ts",
    source: 'import "@repo/domain/features/private/secret";',
  },
  { file: "apps/api/src/null-specific.ts", source: 'import "@repo/domain/features/data.json";' },
  { file: "apps/api/src/null-exact.ts", source: 'import "@repo/domain/features/fixed";' },
  { file: "apps/site/src/edge.ts", source: 'import "@repo/domain/service";' },
  {
    file: "packages/domain/src/edge.ts",
    source: 'export type Item = import("@repo/api/resource").Item;',
  },
  {
    file: "apps/site/src/type.ts",
    source: 'import type { Item } from "@repo/domain/service"; export type Value = Item;',
  },
  {
    file: "apps/site/src/export-type.ts",
    source: 'export type { Item } from "@repo/domain/service";',
  },
  {
    file: "apps/site/src/dynamic.ts",
    source: 'export const value = import("@repo/domain/service");',
  },
  {
    file: "apps/site/src/const.ts",
    source:
      'const base = "@repo/domain"; const path = base + "/service"; export const value = import(path);',
  },
  {
    file: "apps/site/src/template.ts",
    source: 'const name = "domain"; export const value = import(`@repo/${name}/service`);',
  },
  {
    file: "apps/site/src/import-equals.ts",
    source: 'import client = require("@repo/domain/service"); export const value = client;',
  },
  {
    file: "apps/site/src/require.ts",
    source: 'export const value = require("@repo/domain/service");',
  },
  {
    file: "apps/site/src/windows.ts",
    source: 'import "..\\\\..\\\\..\\\\packages\\\\domain\\\\index";',
  },
  { file: "apps/api/src/absolute.ts", source: 'import "$REPO/packages/domain/index";' },
  {
    file: "apps/api/src/absolute-dot.ts",
    source: 'import "$REPO/apps/api/../../packages/domain/index";',
  },
  { file: "apps/api/src/alias-cross.ts", source: 'import "#/service";' },
  { file: "apps/site/src/alias-escape.ts", source: 'import "@local/../../../api/index";' },
  { file: "apps/site/src/traversal.ts", source: 'import "@repo/ui/../domain/service";' },
  { file: "apps/api/src/encoded.ts", source: 'import "@repo/domain/features/%2e%2e/private";' },
  { file: "apps/api/src/empty-segment.ts", source: 'import "@repo/domain/features//value";' },
  {
    file: "apps/api/src/node-modules.ts",
    source: 'import "@repo/domain/features/node_modules/value";',
  },
  { file: "apps/api/src/not-exception.ts", source: 'import "@repo/site/resource";' },
  { file: "nested/apps/api/src/resource.layer.ts", source: 'import "@repo/site/resource";' },
  { file: "root-escape.ts", source: 'import "../outside";' },
  { file: "single-root.ts", source: 'import "./a";' },
  { file: "apps/api/src/file-url.ts", source: 'import "file://$REPO/packages/domain/index.ts";' },
];
const accepted: readonly Fixture[] = [
  { file: "apps/api/src/queried-self.ts", source: 'import "./asset.txt?raw";' },
  { file: "apps/api/src/fragment-self.ts", source: 'import "./asset.txt#fragment";' },
  { file: "apps/site/src/queried-alias.ts", source: 'import "@local/asset.txt?raw";' },
  { file: "apps/api/src/root.ts", source: 'import "@repo/domain";' },
  { file: "apps/api/src/service.ts", source: 'export * from "@repo/domain/service";' },
  { file: "apps/api/src/pattern.ts", source: 'import "@repo/domain/features/nested/open";' },
  { file: "apps/api/src/exact.ts", source: 'import "@repo/domain/features/private/open";' },
  { file: "apps/api/src/suffix.ts", source: 'import "@repo/domain/features/data.special.json";' },
  { file: "apps/api/src/resource.layer.ts", source: 'import "@repo/site/resource";' },
  { file: "apps/api/src/self.ts", source: 'import "./private";' },
  { file: "apps/api/src/absolute-self.ts", source: 'import "$REPO/apps/api/src/private";' },
  { file: "apps/site/src/alias.ts", source: 'import "@local/private";' },
  { file: "packages/domain/src/alias.ts", source: 'import "#/private";' },
  { file: "packages/domain/root.ts", source: 'import "./test/fixture";' },
  { file: "root.ts", source: 'import "./tools/private";' },
  { file: "a/index.ts", source: 'import "./private";' },
  { file: "apps/site/src/ui.ts", source: 'import "@repo/ui/view";' },
  { file: "apps/site/src/external.ts", source: 'import "external-package/private";' },
  { file: "apps/site-backup/src/anchored.ts", source: 'import "../private";' },
  { file: "apps/site-backup/src/unrestricted.ts", source: 'import "@repo/domain/service";' },
  { file: "tools/unscoped.ts", source: 'import "single";' },
  {
    file: "apps/api/src/shadow.ts",
    source:
      'export const address = "@repo/domain/internal"; export const read = (address: string) => import(address);',
  },
  {
    file: "apps/api/src/mutable.ts",
    source:
      'let address = "@repo/domain/internal"; address = external; export const read = import(address);',
  },
  {
    file: "apps/api/src/cyclic.ts",
    source: "const first = second; const second = first; export const read = import(first);",
  },
  {
    file: "apps/api/src/shadow-require.ts",
    source: 'export const read = (require: Client) => require("@repo/domain/internal");',
  },
  {
    file: "apps/api/src/options.ts",
    source: 'export const options = { external: ["@repo/domain/internal"] };',
  },
];

const check = Effect.fnUntraced(function* (fixtures: readonly Fixture[], denied: boolean) {
  const result = yield* lint(fixtures);
  expect(result.stderr).toBe("");
  expect(result.exitCode, result.stdout).toBe(denied ? 1 : 0);
  const report = yield* Schema.decodeEffect(Report)(result.stdout);
  expect(report.number_of_files).toBe(fixtures.length);
  if (denied) {
    Array.forEach(fixtures, ({ file }) =>
      expect(
        Array.some(
          report.diagnostics,
          (diagnostic) => diagnostic.code === rule && diagnostic.filename.endsWith(file),
        ),
        file,
      ).toBe(true),
    );
    expect(report.diagnostics.length).toBe(fixtures.length);
  } else expect(report.diagnostics).toEqual([]);
});

describe("checked workspace import boundaries", () => {
  it.effect(
    "rejects private, relative, pattern and role crossings in the real Oxlint host",
    () => check(rejected, true).pipe(Effect.provide(NodeServices.layer)),
    realCommandTimeout,
  );
  it.effect(
    "accepts public exports, bounded local aliases and exact edge exceptions",
    () => check(accepted, false).pipe(Effect.provide(NodeServices.layer)),
    realCommandTimeout,
  );
  it.effect(
    "fails closed for inconsistent configuration",
    () =>
      Effect.forEach(
        [
          {},
          { ...policy, owners: policy.owners.slice(1) },
          { ...policy, owners: [...policy.owners, { id: "another", root: "apps/api" }] },
          { ...policy, owners: [...policy.owners, { id: "api", root: "apps/another" }] },
          { ...policy, owners: [...policy.owners, { id: "escape", root: "../api" }] },
          { ...policy, workspaces: [...policy.workspaces, ...Array.take(policy.workspaces, 1)] },
          {
            ...policy,
            workspaces: [{ name: "@repo/unknown", owner: "missing", exports: { ".": true } }],
          },
          {
            ...policy,
            workspaces: [
              { name: "@repo/domain", owner: "domain", exports: { "./../private": true } },
            ],
          },
          {
            ...policy,
            workspaces: [{ name: "@repo/domain", owner: "domain", exports: { "./**": true } }],
          },
          { ...policy, forbiddenEdges: [{ from: "site", to: "missing" }] },
          { ...policy, exceptions: [{ fromFile: "apps/api/**", toModule: "@repo/site/resource" }] },
          {
            ...policy,
            exceptions: [
              { fromFile: "../apps/api/src/resource.layer.ts", toModule: "@repo/site/resource" },
            ],
          },
          {
            ...policy,
            exceptions: [
              { fromFile: "apps/api/src/resource.layer.ts", toModule: "@repo/site/private" },
            ],
          },
          {
            ...policy,
            exceptions: [
              { fromFile: "apps/site/src/resource.layer.ts", toModule: "@repo/ui/view" },
            ],
          },
          { ...policy, aliases: [{ prefix: "@repo/domain/", root: "packages/domain/src" }] },
          { ...policy, aliases: [{ prefix: "@local/", root: "../escape" }] },
          {
            ...policy,
            aliases: [
              { prefix: "@local/", root: "apps/site/src" },
              { prefix: "@local/", root: "apps/api/src" },
            ],
          },
          { ...policy, workspacePrefixes: ["*"] },
          {
            ...policy,
            workspaces: [{ name: "@repo/domain", owner: "domain", exports: { ".": null } }],
          },
          { ...policy, accidentalMisspelling: true },
        ],
        (options) =>
          lint([{ file: "entry.ts", source: "export const value = 1;" }], options).pipe(
            Effect.tap((result) =>
              Effect.sync(() => {
                expect(result.exitCode, result.stdout + result.stderr).toBe(1);
                expect(
                  Option.match(result.report, {
                    onNone: () =>
                      (result.stdout + result.stderr).includes(
                        "Options validation failed for rule 'package/workspace-import-boundaries'",
                      ),
                    onSome: (report) =>
                      report.number_of_files === 1 &&
                      Array.some(report.diagnostics, ({ code }) => code === rule),
                  }),
                  result.stdout + result.stderr,
                ).toBe(true);
              }),
            ),
          ),
        { concurrency: 1, discard: true },
      ).pipe(Effect.provide(NodeServices.layer)),
    realCommandTimeout,
  );
});
