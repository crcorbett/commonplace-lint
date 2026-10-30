import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, it } from "@effect/vitest";
import { Array, Effect, FileSystem, Match, Schema } from "effect";
import { command, success } from "./command.js";
import { checkStyleConsumer } from "./style.consumer.js";
import { checkNativeConsumer } from "./native.consumer.js";

const repository = new URL("../../../", import.meta.url).pathname;
const Archive = Schema.Struct({
  filename: Schema.String,
  files: Schema.Array(Schema.Struct({ path: Schema.String })),
});
const Archives = Schema.NonEmptyArray(Archive);
const PackageArchive = Schema.Union([
  Archives,
  Schema.Struct({ "@commonplaces/oxlint-plugin": Archive }),
]);
const Report = Schema.Struct({
  diagnostics: Schema.Array(Schema.Struct({ code: Schema.String, filename: Schema.String })),
  number_of_files: Schema.Int,
});
const BoundaryConfiguration = Schema.fromJsonString(
  Schema.Struct({
    jsPlugins: Schema.Array(Schema.String),
    rules: Schema.Record(Schema.String, Schema.Json),
  }),
);
const archiveCapture = (concurrent: boolean) => `
import { Effect, Stream } from "effect";
import { ChildProcessSpawner } from "effect/process";
export const capture = Effect.gen(function* () {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const handle = yield* spawner.spawn(command);
  return yield* Effect.all({
    exit: handle.exitCode,
    stdout: handle.stdout.pipe(Stream.runCollect),
    stderr: handle.stderr.pipe(Stream.runCollect)
  }${concurrent ? ', { concurrency: "unbounded" }' : ""});
});`;

Array.forEach(["1.88.0", "1.89.0", "1.90.0"], (version) =>
  it.effect(
    `installs the archive independently and runs all exports with Oxlint ${version}`,
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const directory = yield* fs.makeTempDirectoryScoped({
          prefix: "commonplace-lint-package-",
        });
        const packed = yield* success(`${repository}packages/oxlint-plugin`, "npm", [
          "pack",
          "--ignore-scripts",
          "--json",
          "--pack-destination",
          directory,
        ]);
        const archives = yield* Schema.decodeEffect(Schema.fromJsonString(PackageArchive))(packed);
        const archive = Match.value(archives).pipe(
          Match.when(Schema.is(Archives), (reports) => {
            expect(reports).toHaveLength(1);
            const [archive] = reports;
            return archive;
          }),
          Match.orElse(({ "@commonplaces/oxlint-plugin": archive }) => archive),
        );
        expect(
          Array.every(
            archive.files,
            ({ path }) =>
              path.startsWith("dist/") ||
              Array.contains(["package.json", "README.md", "LICENSE"], path),
          ),
        ).toBe(true);
        expect(
          Array.some(
            archive.files,
            ({ path }) =>
              path.endsWith(".map") || path.includes("test/") || path.includes("skills/"),
          ),
        ).toBe(false);
        yield* fs.writeFileString(
          `${directory}/package.json`,
          '{"name":"lint-consumer","private":true,"type":"module","scripts":{"prepare":"effect-tsgo patch --oxlint"}}',
        );
        // Deliberately skip prepare first so missing setup remains a failing control.
        yield* success(directory, "npm", [
          "install",
          "--ignore-scripts",
          "--save-exact",
          "--no-audit",
          "--no-fund",
          "--package-lock=false",
          `${directory}/${archive.filename}`,
          `oxlint@${version}`,
          "typescript@7.0.2",
          "@effect/vitest@4.0.5",
          "vitest@5.0.5",
        ]);
        yield* fs.writeFileString(
          `${directory}/inspect.mjs`,
          `
import assert from "node:assert/strict";
import { general, effect, alchemy, conventions, web, typescript, strict as strictConfig } from "@commonplaces/oxlint-plugin";
import conventionsPlugin from "@commonplaces/oxlint-plugin/conventions";
import webPlugin from "@commonplaces/oxlint-plugin/web";
import strict from "@commonplaces/oxlint-plugin/strict-effect";
import local from "@commonplaces/oxlint-plugin/effect";
import secrets from "@commonplaces/oxlint-plugin/alchemy";
import bun from "@commonplaces/oxlint-plugin/bun";
import packages from "@commonplaces/oxlint-plugin/package";
import style from "@commonplaces/oxlint-plugin/anti-slop";
import styleEffect from "@commonplaces/oxlint-plugin/anti-slop-effect";
const plugins = [strict, local, secrets, bun, packages, style, styleEffect, conventionsPlugin, webPlugin];
assert.deepEqual(plugins.map(plugin => Object.keys(plugin.rules).length), [31, 9, 3, 1, 3, 15, 1, 33, 12]);
assert.equal(plugins.reduce((count, plugin) => count + Object.keys(plugin.rules).length, 0), 108);
for (const group of [general, effect, alchemy, conventions, web]) {
  for (const id of Object.keys(group.rules)) {
    if (id.startsWith("effecttsgo/")) continue;
    const slash = id.indexOf("/");
    const plugin = plugins.find(plugin => plugin.meta.name === id.slice(0, slash));
    assert.ok(plugin?.rules[id.slice(slash + 1)], id);
  }
}
for (const id of ["runtime-file-convention", "module-ownership", "shared-schema-owner", "checked-constant-map", "no-persisted-id-normalisation"]) {
  assert.equal(effect.rules["strict-effect/" + id], undefined);
}
assert.equal(effect.rules["effect/require-service-operation-instrumentation"], "error");
assert.equal(typescript.rules["typescript/no-unsafe-assignment"], "error");
assert.deepEqual(strictConfig.extends, [general, effect, alchemy, conventions, web, typescript]);
`,
        );
        yield* success(directory, "node", ["inspect.mjs"]);
        yield* fs.writeFileString(
          `${directory}/native-setup.config.ts`,
          'import { effect } from "@commonplaces/oxlint-plugin"; export default { extends: [effect] };',
        );
        const unpatched = yield* command(directory, `${directory}/node_modules/.bin/oxlint`, [
          "--config",
          "native-setup.config.ts",
          "--print-config",
        ]);
        expect(unpatched.exitCode).not.toBe(0);
        expect(unpatched.stdout + unpatched.stderr).toContain("effecttsgo");
        const compiler = `${directory}/node_modules/.bin/tsc`;
        yield* fs.writeFileString(
          `${directory}/compiler-proof.ts`,
          'import { Effect } from "effect"; Effect.succeed("forgotten");',
        );
        yield* fs.writeFileString(
          `${directory}/tsconfig.compiler-proof.json`,
          '{"compilerOptions":{"strict":true,"module":"Preserve","moduleResolution":"Bundler","target":"ES2024","skipLibCheck":true,"noEmit":true,"plugins":[{"name":"@effect/language-service","diagnostics":true,"diagnosticSeverity":{"floatingEffect":"error"},"ignoreEffectErrorsInTscExitCode":false}]},"files":["compiler-proof.ts"]}',
        );
        // Ordinary TypeScript accepts this; the prepared Effect compiler must fail.
        yield* success(directory, compiler, ["--project", "tsconfig.compiler-proof.json"]);
        const prepared = yield* success(directory, "npm", [
          "install",
          "--ignore-scripts=false",
          "--no-audit",
          "--no-fund",
          "--package-lock=false",
        ]);
        expect(prepared).toContain("Patched typescript at");
        expect(prepared).toContain("Patched oxlint at");
        const compilerRejected = yield* command(directory, compiler, [
          "--project",
          "tsconfig.compiler-proof.json",
        ]);
        expect(
          compilerRejected.exitCode,
          compilerRejected.stdout || compilerRejected.stderr,
        ).not.toBe(0);
        expect(compilerRejected.stdout + compilerRejected.stderr).toContain("floatingEffect");
        yield* fs.remove(`${directory}/compiler-proof.ts`);
        yield* fs.remove(`${directory}/tsconfig.compiler-proof.json`);
        yield* fs.writeFileString(
          `${directory}/tsconfig.json`,
          '{"compilerOptions":{"strict":true,"module":"Preserve","moduleResolution":"Bundler","target":"ES2024","skipLibCheck":true},"include":["*.ts","*.tsx"]}',
        );
        yield* checkStyleConsumer(directory, compiler);
        yield* checkNativeConsumer(directory, compiler);
        yield* fs.writeFileString(
          `${directory}/oxlint.config.ts`,
          `import { defineConfig } from "oxlint";
import { general, effect, alchemy } from "@commonplaces/oxlint-plugin";
export default defineConfig({ extends: [general, effect, alchemy] });`,
        );
        yield* fs.writeFileString(
          `${directory}/usage.ts`,
          'import { defineConfig } from "oxlint"; import { general, effect, alchemy, style, strict as strictConfig } from "@commonplaces/oxlint-plugin"; import styleConfig from "@commonplaces/oxlint-plugin/style"; import strict from "@commonplaces/oxlint-plugin/strict-effect"; export const config = defineConfig({ extends: [style, strictConfig, styleConfig, general, effect, alchemy] }); export const ruleCount: number = Object.keys(strict.rules).length;',
        );
        yield* success(directory, compiler, [
          "--ignoreConfig",
          "--noEmit",
          "--skipLibCheck",
          "--strict",
          "--module",
          "preserve",
          "--moduleResolution",
          "bundler",
          "--target",
          "ES2024",
          "usage.ts",
        ]);
        yield* fs.writeFileString(
          `${directory}/valid.ts`,
          'import { Effect } from "effect"; export const hello = Effect.succeed("hello");',
        );
        yield* fs.writeFileString(
          `${directory}/invalid.ts`,
          'export const echo = (value: unknown): unknown => value; console.log("oops");',
        );
        const valid = yield* command(directory, `${directory}/node_modules/.bin/oxlint`, [
          "--format",
          "json",
          "valid.ts",
        ]);
        expect(valid.exitCode, valid.stderr || valid.stdout).toBe(0);
        const validReport = yield* Schema.decodeEffect(Schema.fromJsonString(Report))(valid.stdout);
        expect(validReport.number_of_files).toBe(1);
        expect(validReport.diagnostics).toEqual([]);
        yield* fs.writeFileString(
          `${directory}/service-invalid.ts`,
          'import { Library as Alias } from "./service"; import { Effect } from "effect"; export const client = Alias.of({ read: Effect.void });',
        );
        yield* fs.writeFileString(
          `${directory}/service-valid.ts`,
          'import { Library as Alias } from "./service"; import { Effect } from "effect"; export const client = Alias.of({ read: Effect.void.pipe(Effect.withSpan("Library.read")) });',
        );
        const serviceBad = yield* command(directory, `${directory}/node_modules/.bin/oxlint`, [
          "--format",
          "json",
          "service-invalid.ts",
        ]);
        expect(serviceBad.exitCode).toBe(1);
        const serviceReport = yield* Schema.decodeEffect(Schema.fromJsonString(Report))(
          serviceBad.stdout,
        );
        expect(Array.map(serviceReport.diagnostics, ({ code }) => code)).toContain(
          "effect(require-service-operation-instrumentation)",
        );
        yield* success(directory, `${directory}/node_modules/.bin/oxlint`, ["service-valid.ts"]);
        yield* fs.writeFileString(
          `${directory}/conventions.config.ts`,
          'import { defineConfig } from "oxlint"; import { conventions, web } from "@commonplaces/oxlint-plugin"; export default defineConfig({ extends: [conventions, web] });',
        );
        yield* fs.writeFileString(
          `${directory}/conventions-invalid.tsx`,
          'export interface Client { readonly useClient: <T>(f: Callback<T>) => T; } export const view = <div className="space-x-4" />;',
        );
        yield* fs.writeFileString(
          `${directory}/conventions-valid.tsx`,
          'export interface Client { readonly read: Read; } export const view = <div className="flex gap-4" />;',
        );
        const conventionBad = yield* command(directory, `${directory}/node_modules/.bin/oxlint`, [
          "--config",
          "conventions.config.ts",
          "--format",
          "json",
          "conventions-invalid.tsx",
        ]);
        expect(conventionBad.exitCode).toBe(1);
        const conventionReport = yield* Schema.decodeEffect(Schema.fromJsonString(Report))(
          conventionBad.stdout,
        );
        expect(Array.map(conventionReport.diagnostics, ({ code }) => code)).toEqual(
          expect.arrayContaining([
            "effect-conventions(no-generic-client-escape)",
            "web(gap-layout)",
          ]),
        );
        yield* success(directory, `${directory}/node_modules/.bin/oxlint`, [
          "--config",
          "conventions.config.ts",
          "conventions-valid.tsx",
        ]);
        // Real host syntax has parent/scope cycles. Structural equality on visited
        // nodes previously spent minutes traversing this graph instead of linting.
        const largeSource = yield* fs.readFileString(
          `${repository}packages/oxlint-plugin/src/strict-effect.ts`,
        );
        yield* fs.writeFileString(
          `${directory}/large.ts`,
          largeSource +
            "\ninterface MergedHost { readonly first: string }\ninterface MergedHost { readonly second: string }\n",
        );
        const large = yield* command(directory, `${directory}/node_modules/.bin/oxlint`, [
          "--format",
          "json",
          "large.ts",
        ]).pipe(Effect.timeout("20 seconds"));
        expect(large.exitCode, large.stderr || large.stdout).toBe(0);
        const invalid = yield* command(directory, `${directory}/node_modules/.bin/oxlint`, [
          "--format",
          "json",
          "invalid.ts",
        ]);
        expect(invalid.exitCode).toBe(1);
        const invalidReport = yield* Schema.decodeEffect(Schema.fromJsonString(Report))(
          invalid.stdout,
        );
        expect(Array.map(invalidReport.diagnostics, ({ code }) => code)).toEqual(
          expect.arrayContaining([
            "anti-slop(no-unknown-parameters)",
            "anti-slop(no-unknown-returns)",
            "effect(no-console)",
          ]),
        );

        // These behaviours must survive the published archive and each supported
        // host; registration counts alone cannot establish the new rules work.
        yield* fs.makeDirectory(`${directory}/packages/service`, { recursive: true });
        yield* fs.writeFileString(
          `${directory}/packages/service/package.json`,
          '{"name":"@archive/service","type":"module","exports":{".":null,"./service":"./index.ts"}}',
        );
        yield* fs.writeFileString(
          `${directory}/packages/service/index.ts`,
          'export const service = "public";',
        );
        const boundaryConfig = `${directory}/boundaries.oxlint.json`;
        yield* fs.writeFileString(
          boundaryConfig,
          yield* Schema.encodeEffect(BoundaryConfiguration)({
            jsPlugins: [
              "@commonplaces/oxlint-plugin/package",
              "@commonplaces/oxlint-plugin/strict-effect",
            ],
            rules: {
              "package/workspace-import-boundaries": [
                "error",
                {
                  owners: [
                    { id: "root", root: "." },
                    { id: "service", root: "packages/service" },
                  ],
                  workspaces: [
                    {
                      name: "@archive/service",
                      owner: "service",
                      exports: { ".": false, "./service": true },
                    },
                  ],
                  workspacePrefixes: ["@archive/"],
                  forbiddenEdges: [],
                  exceptions: [],
                  aliases: [],
                },
              ],
              "strict-effect/subprocess-pipe-capture": "error",
              "strict-effect/http-client-error-classification": "error",
            },
          }),
        );
        yield* fs.writeFileString(
          `${directory}/boundary-valid.ts`,
          'import "@archive/service/service";' +
            archiveCapture(true) +
            'import { Match } from "effect"; class Unavailable {} export const map = Match.tagsExhaustive({ DecodeError: () => new Unavailable(), TransportError: () => new Unavailable(), StatusCodeError: () => new Unavailable() });',
        );
        const boundaryValid = yield* command(directory, `${directory}/node_modules/.bin/oxlint`, [
          "--config",
          boundaryConfig,
          "--format",
          "json",
          "boundary-valid.ts",
        ]);
        expect(boundaryValid.exitCode, boundaryValid.stderr || boundaryValid.stdout).toBe(0);
        const boundaryValidReport = yield* Schema.decodeEffect(Schema.fromJsonString(Report))(
          boundaryValid.stdout,
        );
        expect(boundaryValidReport.number_of_files).toBe(1);
        expect(boundaryValidReport.diagnostics).toEqual([]);
        const boundaryInvalid = [
          {
            file: "boundary-relative.ts",
            source: 'import "./packages/service";',
            code: "package(workspace-import-boundaries)",
          },
          {
            file: "boundary-private.ts",
            source: 'import "@archive/service/private";',
            code: "package(workspace-import-boundaries)",
          },
          {
            file: "boundary-nonpublic-root.ts",
            source: 'import "@archive/service";',
            code: "package(workspace-import-boundaries)",
          },
          {
            file: "boundary-sequential.ts",
            source: archiveCapture(false),
            code: "strict-effect(subprocess-pipe-capture)",
          },
          {
            file: "boundary-http-body.ts",
            source:
              'import { Match } from "effect"; class Integrity {} class Unavailable {} export const map = Match.tagsExhaustive({ DecodeError: () => new Integrity(), TransportError: () => new Unavailable(), StatusCodeError: () => new Unavailable() });',
            code: "strict-effect(http-client-error-classification)",
          },
        ];
        yield* Effect.forEach(
          boundaryInvalid,
          ({ file, source }) => fs.writeFileString(`${directory}/${file}`, source),
          { discard: true },
        );
        const boundaryRejected = yield* command(
          directory,
          `${directory}/node_modules/.bin/oxlint`,
          [
            "--config",
            boundaryConfig,
            "--format",
            "json",
            ...Array.map(boundaryInvalid, ({ file }) => file),
          ],
        );
        expect(boundaryRejected.exitCode, boundaryRejected.stderr || boundaryRejected.stdout).toBe(
          1,
        );
        const boundaryRejectedReport = yield* Schema.decodeEffect(Schema.fromJsonString(Report))(
          boundaryRejected.stdout,
        );
        expect(boundaryRejectedReport.number_of_files).toBe(boundaryInvalid.length);
        expect(boundaryRejectedReport.diagnostics).toHaveLength(boundaryInvalid.length);
        Array.forEach(boundaryInvalid, ({ file, code }) =>
          expect(
            Array.some(
              boundaryRejectedReport.diagnostics,
              (diagnostic) => diagnostic.filename === file && diagnostic.code === code,
            ),
            `${version}: ${file}`,
          ).toBe(true),
        );
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
    120_000,
  ),
);
