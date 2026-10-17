import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, it } from "@effect/vitest";
import { Array, Effect, FileSystem, Schema, Stream } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/process";

const repository = new URL("../../../", import.meta.url).pathname;
const PackageArchive = Schema.NonEmptyArray(
  Schema.Struct({
    filename: Schema.String,
    files: Schema.Array(Schema.Struct({ path: Schema.String })),
  }),
);
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

const command = Effect.fnUntraced(function* (
  cwd: string,
  executable: string,
  args: readonly string[],
) {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  return yield* Effect.scoped(
    Effect.gen(function* () {
      const child = yield* spawner.spawn(
        ChildProcess.make(executable, args, { cwd, stdout: "pipe", stderr: "pipe" }),
      );
      const read = (stream: typeof child.stdout) =>
        stream.pipe(
          Stream.decodeText,
          Stream.runFold(
            () => "",
            (text, chunk) => text + chunk,
          ),
        );
      return yield* Effect.all(
        {
          exitCode: child.exitCode,
          stdout: read(child.stdout),
          stderr: read(child.stderr),
        },
        { concurrency: "unbounded" },
      );
    }),
  );
});

const success = Effect.fnUntraced(function* (
  cwd: string,
  executable: string,
  args: readonly string[],
) {
  const result = yield* command(cwd, executable, args);
  expect(result.exitCode, result.stderr || result.stdout).toBe(0);
  return result.stdout;
});

Array.forEach(["1.80.0", "1.85.0", "1.86.0"], (version) =>
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
        expect(archives).toHaveLength(1);
        const [archive] = archives;
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
          '{"name":"lint-consumer","private":true,"type":"module"}',
        );
        // Install the actual archive. Registry downloads need no npm account and scripts are disabled.
        yield* success(directory, "npm", [
          "install",
          "--ignore-scripts",
          "--no-audit",
          "--no-fund",
          "--package-lock=false",
          `${directory}/${archive.filename}`,
          `oxlint@${version}`,
        ]);
        yield* fs.writeFileString(
          `${directory}/inspect.mjs`,
          `
import assert from "node:assert/strict";
import { general, effect, alchemy } from "@commonplaces/oxlint-plugin";
import strict from "@commonplaces/oxlint-plugin/strict-effect";
import local from "@commonplaces/oxlint-plugin/effect";
import secrets from "@commonplaces/oxlint-plugin/alchemy";
import bun from "@commonplaces/oxlint-plugin/bun";
import packages from "@commonplaces/oxlint-plugin/package";
import style from "@commonplaces/oxlint-plugin/anti-slop";
import styleEffect from "@commonplaces/oxlint-plugin/anti-slop-effect";
const plugins = [strict, local, secrets, bun, packages, style, styleEffect];
assert.deepEqual(plugins.map(plugin => Object.keys(plugin.rules).length), [29, 9, 3, 1, 3, 15, 1]);
assert.equal(plugins.reduce((count, plugin) => count + Object.keys(plugin.rules).length, 0), 61);
for (const group of [general, effect, alchemy]) {
  for (const id of Object.keys(group.rules)) {
    const slash = id.indexOf("/");
    const plugin = plugins.find(plugin => plugin.meta.name === id.slice(0, slash));
    assert.ok(plugin?.rules[id.slice(slash + 1)], id);
  }
}
for (const id of ["runtime-file-convention", "module-ownership", "shared-schema-owner", "checked-constant-map", "no-persisted-id-normalisation"]) {
  assert.equal(effect.rules["strict-effect/" + id], undefined);
}
assert.equal(effect.rules["effect/require-service-operation-instrumentation"], undefined);
`,
        );
        yield* success(directory, "node", ["inspect.mjs"]);
        yield* fs.writeFileString(
          `${directory}/oxlint.config.ts`,
          `import { defineConfig } from "oxlint";
import { general, effect, alchemy } from "@commonplaces/oxlint-plugin";
export default defineConfig({ extends: [general, effect, alchemy] });`,
        );
        yield* fs.writeFileString(
          `${directory}/usage.ts`,
          'import { defineConfig } from "oxlint"; import { general, effect, alchemy } from "@commonplaces/oxlint-plugin"; import strict from "@commonplaces/oxlint-plugin/strict-effect"; export const config = defineConfig({ extends: [general, effect, alchemy] }); export const ruleCount: number = Object.keys(strict.rules).length;',
        );
        yield* success(directory, `${repository}node_modules/.bin/tsc`, [
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
            },
          }),
        );
        yield* fs.writeFileString(
          `${directory}/boundary-valid.ts`,
          'import "@archive/service/service";' + archiveCapture(true),
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
