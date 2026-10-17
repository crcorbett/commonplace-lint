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
  diagnostics: Schema.Array(Schema.Struct({ code: Schema.String })),
  number_of_files: Schema.Int,
});

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
      return yield* Effect.all({
        exitCode: child.exitCode,
        stdout: read(child.stdout),
        stderr: read(child.stderr),
      });
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

Array.forEach(["1.80.0", "1.85.0"], (version) =>
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
assert.deepEqual(plugins.map(plugin => Object.keys(plugin.rules).length), [28, 9, 3, 1, 2, 15, 1]);
assert.equal(plugins.reduce((count, plugin) => count + Object.keys(plugin.rules).length, 0), 59);
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
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
    120_000,
  ),
);
