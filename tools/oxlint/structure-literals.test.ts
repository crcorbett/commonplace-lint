import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { Array, Effect, FileSystem, Schema, Stream } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/process";

const Report = Schema.fromJsonString(
  Schema.Struct({
    diagnostics: Schema.Array(Schema.Struct({ code: Schema.String, message: Schema.String })),
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
// temporary working directory, so owner paths resolve as in a consumer.
const lint = Effect.fnUntraced(function* (
  plugin: "web" | "package" | "strict-effect",
  rule: string,
  options: Schema.Json,
  source: string,
  target: string,
) {
  const fs = yield* FileSystem.FileSystem;
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  return yield* Effect.scoped(
    Effect.gen(function* () {
      const temporary = yield* fs.makeTempDirectoryScoped({ prefix: "structure-literals-" });
      const filename = `${temporary}/${target}`;
      yield* fs.makeDirectory(filename.slice(0, filename.lastIndexOf("/")), { recursive: true });
      yield* fs.writeFileString(filename, source);
      const configuration = `${temporary}/oxlint.json`;
      yield* fs.writeFileString(
        configuration,
        yield* Schema.encodeEffect(Configuration)({
          jsPlugins: [`${root}packages/oxlint-plugin/dist/${plugin}.js`],
          rules: { [`${plugin}/${rule}`]: options === null ? "error" : ["error", options] },
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
      expect(report.number_of_files, result.stderr).toBe(1);
      return Array.filter(report.diagnostics, ({ code }) => code === `${plugin}(${rule})`);
    }),
  );
});

interface Case {
  readonly plugin: "web" | "package" | "strict-effect";
  readonly rule: string;
  readonly options: Schema.Json;
  readonly target: string;
  readonly owners: ReadonlyArray<string>;
  readonly rejected: ReadonlyArray<string>;
  readonly accepted: ReadonlyArray<string>;
}

const cases: ReadonlyArray<Case> = [
  {
    plugin: "web",
    rule: "no-colour-literals",
    options: null,
    target: "apps/web/src/components/panel.tsx",
    owners: ["apps/web/src/styles/tokens.tsx", "packages/ui/src/theme.tsx"],
    rejected: [
      'export const Panel = () => <div style={{ color: "#172033" }} />;',
      'export const Panel = () => <div style={{ background: "#fff" }} />;',
      'export const Icon = () => <path fill="#2563eb" />;',
      'export const Badge = () => <span className="bg-[#fff] p-2" />;',
      'export const border = "1px solid #d6dde7";',
      'export const brand = "#2563EB";',
      'export const muted = "#abc";',
      'export const shadow = "0 1px 2px rgba(0, 0, 0, 0.1)";',
      'export const accent = "oklch(62% 0.19 255)";',
      'export const css = "color: #fff;";',
      "const css = (parts: TemplateStringsArray) => parts.join(''); export const card = css`color: #fff;`;",
      "export const ring = (width: number) => `${width}px solid hsl(210 40% 50%)`;",
    ],
    accepted: [
      'export const Panel = () => <div style={{ color: "var(--colour-text)" }} />;',
      'export const issue = "Fixes #123";',
      'export const anchor = "#main-content";',
      'export const link = "/docs#faded";',
      'export const url = "https://example.com/#cafe";',
      'export const html = "&#x2014;";',
      'export const id = "build-#2563eb7";',
      'export const word = "rgb";',
    ],
  },
  {
    plugin: "package",
    rule: "no-duplicated-owned-literals",
    options: {
      ownedLiterals: [
        {
          value: "2026-10-04",
          owner: "@taxkit/infrastructure/worker-settings",
          allowedFiles: ["packages/infrastructure/src/worker-settings.ts"],
        },
        {
          value: "nodejs_compat",
          owner: "@taxkit/infrastructure/worker-settings",
          allowedFiles: ["packages/infrastructure/src/worker-settings.ts"],
        },
        {
          value: 3211,
          owner: "@taxkit/infrastructure/ports",
          allowedFiles: ["packages/infrastructure/src/worker-settings.ts"],
        },
      ],
    },
    target: "apps/api/alchemy.run.ts",
    owners: ["packages/infrastructure/src/worker-settings.ts"],
    rejected: [
      'export const props = { compatibilityDate: "2026-10-04" };',
      'export const props = { compatibilityFlags: ["nodejs_compat"] };',
      "export const date = `2026-10-04`;",
      "export const port = 3211;",
    ],
    accepted: [
      'import { compatibilityDate } from "@taxkit/infrastructure/worker-settings"; export const props = { compatibilityDate };',
      'export const later = "2026-10-05";',
      "export const date = (year: string) => `${year}-10-04`;",
      'export const text = "Use nodejs_compat from the owner.";',
      'export const keyed = { "nodejs_compat": true };',
      'export type Flag = "nodejs_compat";',
    ],
  },
  {
    plugin: "package",
    rule: "no-cross-app-source-paths",
    options: null,
    target: "apps/web/test/native-pair.boundary.test.ts",
    owners: ["apps/api/test/worker.test.ts", "packages/infrastructure/test/apps.test.ts"],
    rejected: [
      'import path from "node:path"; export const worker = (root: string) => path.join(root, "apps/api/src/worker.ts");',
      'export const worker = new URL("../../api/src/worker.ts", import.meta.url);',
      "export const catalogue = (root: string) => `${root}/apps/api/src/generated/docs.json`;",
      'export const folder = "apps/api/src";',
    ],
    accepted: [
      'export const own = new URL("../src/router.tsx", import.meta.url);',
      'export const ownRoot = "apps/web/src/router.tsx";',
      'export const built = "apps/api/dist/worker.js";',
      'export const tests = "apps/api/test/worker.test.ts";',
      'export const shared = "packages/core/src/money.ts";',
    ],
  },
];

describe("structure literal rules", () => {
  Array.forEach(cases, (entry) => {
    it.effect(
      `${entry.rule} rejects copies and accepts owners and unrelated text`,
      () =>
        Effect.gen(function* () {
          yield* Effect.forEach(
            entry.rejected,
            (source) =>
              Effect.gen(function* () {
                const found = yield* lint(
                  entry.plugin,
                  entry.rule,
                  entry.options,
                  source,
                  entry.target,
                );
                expect(found.length, source).toBeGreaterThan(0);
                yield* Effect.forEach(
                  entry.owners,
                  (owner) =>
                    lint(entry.plugin, entry.rule, entry.options, source, owner).pipe(
                      Effect.map((owned) => expect(owned, `${source} at ${owner}`).toEqual([])),
                    ),
                  { discard: true },
                );
              }),
            { discard: true },
          );
          yield* Effect.forEach(
            entry.accepted,
            (source) =>
              lint(entry.plugin, entry.rule, entry.options, source, entry.target).pipe(
                Effect.map((found) => expect(found, source).toEqual([])),
              ),
            { discard: true },
          );
        }).pipe(Effect.provide(NodeServices.layer)),
      180_000,
    );
  });

  it.effect(
    "configured colour owners replace the token defaults and tests can be allowed",
    () =>
      Effect.gen(function* () {
        const source = 'export const brand = "#2563eb";';
        const options = { allowedFiles: ["apps/web/src/brand/**"], allowTestFiles: true };
        expect(
          yield* lint("web", "no-colour-literals", options, source, "src/tokens.ts"),
        ).toHaveLength(1);
        expect(
          yield* lint(
            "web",
            "no-colour-literals",
            options,
            source,
            "apps/web/src/brand/palette.ts",
          ),
        ).toEqual([]);
        expect(
          yield* lint("web", "no-colour-literals", options, source, "apps/web/test/panel.test.ts"),
        ).toEqual([]);
      }).pipe(Effect.provide(NodeServices.layer)),
    60_000,
  );

  it.effect(
    "owned literals require options, and app patterns and exceptions are configurable",
    () =>
      Effect.gen(function* () {
        const missing = yield* lint(
          "package",
          "no-duplicated-owned-literals",
          null,
          "export const value = 1;",
          "src/value.ts",
        );
        expect(missing).toHaveLength(1);
        const source = 'export const worker = "services/api/src/worker.ts";';
        expect(
          yield* lint(
            "package",
            "no-cross-app-source-paths",
            null,
            source,
            "services/web/test/a.ts",
          ),
        ).toEqual([]);
        expect(
          yield* lint(
            "package",
            "no-cross-app-source-paths",
            { apps: ["services/*"] },
            source,
            "services/web/test/a.ts",
          ),
        ).toHaveLength(1);
        expect(
          yield* lint(
            "package",
            "no-cross-app-source-paths",
            { apps: ["services/*"], allowedFiles: ["services/web/test/a.ts"] },
            source,
            "services/web/test/a.ts",
          ),
        ).toEqual([]);
      }).pipe(Effect.provide(NodeServices.layer)),
    60_000,
  );

  it.effect(
    "no-owner-paths-in-rules checks rule modules by default and stays quiet elsewhere",
    () =>
      Effect.gen(function* () {
        const rule = `import { defineRule } from "@oxlint/plugins";
export const owner = "apps/web/src/lib/runtime.client.ts";
export const rule = defineRule({ meta: {}, create: () => ({}) });`;
        expect(
          yield* lint("strict-effect", "no-owner-paths-in-rules", null, rule, "tools/rules/a.ts"),
        ).toHaveLength(1);
        expect(
          yield* lint(
            "strict-effect",
            "no-owner-paths-in-rules",
            null,
            'export const owner = "apps/web/src/lib/runtime.client.ts";',
            "oxlint.config.ts",
          ),
        ).toEqual([]);
      }).pipe(Effect.provide(NodeServices.layer)),
    60_000,
  );
});
