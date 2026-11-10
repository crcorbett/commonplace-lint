import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { Array, Effect, FileSystem, Predicate, Record, Schema, Stream } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/process";

const root = new URL("../../", import.meta.url).pathname;
const doctor = `${root}packages/oxlint-plugin/dist/doctor/main.js`;
const node = process.execPath;
// Package scripts put the consumer's binaries on PATH; mirror that here.
const path = `${root}node_modules/.bin:${node.slice(0, node.lastIndexOf("/"))}:/usr/bin:/bin`;
const localPlugin = `export default {
  meta: { name: "local" },
  rules: Object.fromEntries(
    ["no-instanceof", "no-console-outside-runtime", "no-ambient-process-reads", "no-process-outside-boundaries", "invoice-rounding"]
      .map((name) => [name, { create: () => ({}) }]),
  ),
};
`;

const JsonText = Schema.fromJsonString(Schema.Json);

// Writes a synthetic consumer repository and runs the built doctor command in it.
// String contents are written as they are; other values are encoded as JSON.
const diagnose = Effect.fnUntraced(function* (
  files: Readonly<Record<string, Schema.Json>>,
  args: readonly string[] = [],
) {
  const fs = yield* FileSystem.FileSystem;
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  return yield* Effect.scoped(
    Effect.gen(function* () {
      const directory = yield* fs.makeTempDirectoryScoped({ prefix: "lint-doctor-" });
      yield* Effect.forEach(
        Record.toEntries(files),
        ([file, content]) =>
          Effect.gen(function* () {
            const target = `${directory}/${file}`;
            yield* fs.makeDirectory(target.slice(0, target.lastIndexOf("/")), { recursive: true });
            yield* fs.writeFileString(
              target,
              Predicate.isString(content) ? content : yield* Schema.encodeEffect(JsonText)(content),
            );
          }),
        { discard: true },
      );
      const handle = yield* spawner.spawn(
        ChildProcess.make(node, [doctor, ...args], {
          cwd: directory,
          env: { PATH: path },
          stdout: "pipe",
          stderr: "pipe",
        }),
      );
      const read = (stream: typeof handle.stdout) =>
        stream.pipe(
          Stream.decodeText,
          Stream.runFold(
            () => "",
            (text, chunk) => text + chunk,
          ),
        );
      const result = yield* Effect.all(
        { exitCode: handle.exitCode, stdout: read(handle.stdout), stderr: read(handle.stderr) },
        { concurrency: "unbounded" },
      );
      return { ...result, lines: Array.filter(result.stdout.split("\n"), (line) => line !== "") };
    }),
  );
});

const manifest = (version: string, scripts: Readonly<Record<string, string>>) => ({
  name: "consumer",
  private: true,
  devDependencies: { "@commonplaces/oxlint-plugin": version },
  scripts,
});
const refresh =
  "bun update @commonplaces/oxlint-plugin --latest --no-save --ignore-scripts && effect-tsgo patch --oxlint";
const refreshed = {
  lint: "bun run lint:refresh && oxlint --type-aware .",
  "lint:refresh": refresh,
};

describe("lint doctor", () => {
  it.effect(
    "reports pinned versions, missing refresh, duplicated local rules and missing owner paths",
    () =>
      Effect.gen(function* () {
        const result = yield* diagnose({
          "package.json": manifest("0.8.0", { lint: "oxlint ." }),
          "src/host.ts": "export const host = 1;\n",
          "tools/oxlint/local-rules.js": localPlugin,
          ".oxlintrc.json": {
            jsPlugins: [
              "./tools/oxlint/local-rules.js",
              `${root}packages/oxlint-plugin/dist/strict-effect.js`,
            ],
            rules: {
              "local/no-instanceof": "error",
              "local/no-console-outside-runtime": "error",
              "local/no-ambient-process-reads": "error",
              "local/no-process-outside-boundaries": "off",
              "local/invoice-rounding": "error",
              "strict-effect/no-promise-workflow": [
                "error",
                { allowedFiles: ["src/host.ts", "src/removed-adapter.ts"] },
              ],
            },
          },
        });
        expect(result.exitCode, result.stderr).toBe(1);
        expect(result.lines).toEqual([
          'error version: @commonplaces/oxlint-plugin is "0.8.0". Declare "latest" and refresh it before lint.',
          expect.stringMatching(/^error refresh: No @commonplaces\/oxlint-plugin refresh/u),
          "error duplicate: local/no-instanceof repeats effect/no-instanceof. Remove the local rule and configure the preset rule instead.",
          "error duplicate: local/no-console-outside-runtime repeats effect/no-console. Remove the local rule and configure the preset rule instead.",
          "warning duplicate: local/no-ambient-process-reads has a name close to effect/no-ambient-process. Check whether the preset rule already owns it.",
          "error path: strict-effect/no-promise-workflow names src/removed-adapter.ts, which does not exist.",
        ]);
      }).pipe(Effect.provide(NodeServices.layer)),
    60_000,
  );

  it.effect(
    "accepts a latest, refreshed consumer with a TypeScript configuration",
    () =>
      Effect.gen(function* () {
        const result = yield* diagnose({
          "package.json": manifest("latest", refreshed),
          "src/host.ts": "export const host = 1;\n",
          "oxlint.config.ts": `export default {
  jsPlugins: ["${root}packages/oxlint-plugin/dist/strict-effect.js"],
  rules: { "strict-effect/no-promise-workflow": ["error", { allowedFiles: ["src/host.ts"] }] },
};
`,
        });
        expect(result.lines, result.stderr).toEqual([
          "commonplace-lint-doctor: no problems found.",
        ]);
        expect(result.exitCode).toBe(0);
      }).pipe(Effect.provide(NodeServices.layer)),
    60_000,
  );

  it.effect(
    "requires the refresh before oxlint, following script references and pre-scripts",
    () =>
      Effect.gen(function* () {
        const config = { ".oxlintrc.json": { rules: {} } };
        const late = yield* diagnose({
          ...config,
          "package.json": manifest("latest", {
            lint: "oxlint . && bun run lint:refresh",
            "lint:refresh": refresh,
          }),
        });
        expect(late.lines).toEqual([
          expect.stringMatching(/^error refresh: No @commonplaces\/oxlint-plugin refresh/u),
        ]);
        const nested = yield* diagnose({
          ...config,
          "package.json": manifest("latest", {
            prelint: "npm run lint:refresh",
            lint: "bun run lint:check",
            "lint:check": "oxlint .",
            "lint:refresh": refresh,
          }),
        });
        expect(nested.lines, nested.stderr).toEqual([
          "commonplace-lint-doctor: no problems found.",
        ]);
        const extended = yield* diagnose({
          "package.json": manifest("latest", refreshed),
          ".oxlintrc.json": { extends: ["./tools/oxlint/base.json"] },
          "tools/oxlint/base.json": { rules: { "local/no-manual-tag": "error" } },
        });
        expect(extended.lines).toEqual([
          "error duplicate: local/no-manual-tag repeats effect/no-manual-tag. Remove the local rule and configure the preset rule instead.",
        ]);
        const broken = yield* diagnose({
          "package.json": manifest("latest", refreshed),
          "oxlint.config.ts": 'import base from "./missing.ts"; export default base;\n',
        });
        expect(broken.exitCode).toBe(1);
        expect(broken.lines).toEqual([
          expect.stringMatching(/^error config: Could not load oxlint\.config\.ts: .*missing/u),
        ]);
      }).pipe(Effect.provide(NodeServices.layer)),
    60_000,
  );

  it.effect(
    "skips missing paths that match ownerPaths.allowMissing or --allow-missing globs",
    () =>
      Effect.gen(function* () {
        const consumer = {
          "package.json": manifest("latest", refreshed),
          ".oxlintrc.json": {
            rules: {
              "strict-effect/no-imperative-collections": [
                "error",
                {
                  allowedFiles: [
                    "tools/oxlint/.generated-collection-host.ts",
                    "tools/oxlint/fixtures/sample.ts",
                    "src/removed-adapter.ts",
                  ],
                },
              ],
            },
          },
        };
        const removed =
          "error path: strict-effect/no-imperative-collections names src/removed-adapter.ts, which does not exist.";
        const configured = yield* diagnose({
          ...consumer,
          "commonplace.repository.json": {
            responsibilities: { "knip-config": "knip.json" },
            ownerPaths: {
              sources: ["tools/oxlint/package-roles.ts"],
              allowMissing: ["**/.generated-*", "tools/oxlint/fixtures/{sample,other}.ts"],
            },
          },
        });
        expect(configured.lines, configured.stderr).toEqual([removed]);
        const flagged = yield* diagnose(consumer, [
          "--allow-missing",
          "tools/oxlint/.generated-*",
          "--allow-missing=tools/**/fixtures/*.ts",
        ]);
        expect(flagged.lines, flagged.stderr).toEqual([removed]);
        const unlisted = yield* diagnose(consumer, ["--allow-missing", "tools/.generated-*"]);
        expect(unlisted.lines).toEqual([
          "error path: strict-effect/no-imperative-collections names tools/oxlint/.generated-collection-host.ts, which does not exist.",
          "error path: strict-effect/no-imperative-collections names tools/oxlint/fixtures/sample.ts, which does not exist.",
          removed,
        ]);
      }).pipe(Effect.provide(NodeServices.layer)),
    60_000,
  );

  it.effect(
    "reports a malformed repository configuration or flag",
    () =>
      Effect.gen(function* () {
        const consumer = {
          "package.json": manifest("latest", refreshed),
          ".oxlintrc.json": { rules: {} },
        };
        const malformed = yield* diagnose({
          ...consumer,
          "commonplace.repository.json": { ownerPaths: { allowMissing: "**/.generated-*" } },
        });
        expect(malformed.exitCode).toBe(1);
        expect(malformed.lines).toEqual([
          "error config: commonplace.repository.json is not valid: it must be a JSON object whose optional ownerPaths.allowMissing is a list of glob strings.",
        ]);
        const unreadable = yield* diagnose({
          ...consumer,
          "commonplace.repository.json": "{ ownerPaths: [",
        });
        expect(unreadable.lines).toEqual([
          expect.stringMatching(/^error config: commonplace\.repository\.json is not valid/u),
        ]);
        const flag = yield* diagnose(consumer, ["--allow-missing"]);
        expect(flag.exitCode).toBe(1);
        expect(flag.lines).toEqual(["error config: --allow-missing needs a glob."]);
      }).pipe(Effect.provide(NodeServices.layer)),
    60_000,
  );
});
