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
const rule = "package/no-redundant-rule-registrations";
// These illustrative pairs represent a receiving project's reviewed decision,
// not a claim that this library knows which rule implementations are equivalent.
const throwPair = { owner: "current/no-throw", redundant: "legacy/no-throw" };
const pairs = [throwPair, { owner: "current/no-switch", redundant: "legacy/no-switch" }];
const setting: Schema.Json = ["error", { pairs }];
const both = '"current/no-throw": "error", "legacy/no-throw": "warn"';

const lint = Effect.fnUntraced(function* (
  source: string,
  target: string,
  configured: Schema.Json = setting,
) {
  const fs = yield* FileSystem.FileSystem;
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  return yield* Effect.scoped(
    Effect.gen(function* () {
      const directory = yield* fs.makeTempDirectoryScoped({ prefix: "redundant-registrations-" });
      yield* fs.writeFileString(`${directory}/${target}`, source);
      const configuration = `${directory}/lint.json`;
      yield* fs.writeFileString(
        configuration,
        yield* Schema.encodeEffect(Configuration)({
          jsPlugins: [`${root}packages/oxlint-plugin/dist/package.js`],
          rules: { [rule]: configured },
        }),
      );
      const handle = yield* spawner.spawn(
        ChildProcess.make(
          `${root}node_modules/.bin/oxlint`,
          ["--threads", "1", "--config", configuration, "--format", "json", target],
          { cwd: directory, stdout: "pipe", stderr: "pipe" },
        ),
      );
      const read = (stream: typeof handle.stdout) =>
        stream.pipe(
          Stream.decodeText,
          Stream.runFold(
            () => "",
            (text, chunk) => text + chunk,
          ),
        );
      const result = yield* Effect.all({
        exitCode: handle.exitCode,
        stdout: read(handle.stdout),
        stderr: read(handle.stderr),
      });
      const report = yield* Schema.decodeEffect(Report)(result.stdout);
      return {
        ...result,
        files: report.number_of_files,
        diagnostics: Array.filter(
          report.diagnostics,
          ({ code }) => code === "package(no-redundant-rule-registrations)",
        ),
      };
    }),
  );
});

interface Case {
  readonly name: string;
  readonly source: string;
  readonly target: string;
  readonly count: number;
}

const cases: readonly Case[] = [
  {
    name: "recognises aliased Oxlint imports in custom config modules",
    source: `import { defineConfig as configure } from "oxlint";
      export default configure({ rules: { ${both} } });`,
    target: "custom-config.ts",
    count: 1,
  },
  {
    name: "recognises namespace imports, array severities and multiple supplied pairs",
    source: `import * as Oxlint from "oxlint";
      export default Oxlint.defineConfig({ rules: {
        "current/no-throw": [2, {}], "legacy/no-throw": [1],
        "current/no-switch": "deny", "legacy/no-switch": ["error", {}],
      } });`,
    target: "custom-config.ts",
    count: 2,
  },
  {
    name: "recognises a single-use local alias of the imported config helper",
    source: `import { defineConfig } from "oxlint"; const configure = defineConfig;
      export default configure({ rules: { ${both} } });`,
    target: "custom-config.ts",
    count: 1,
  },
  {
    name: "accepts static local constants and transparent TypeScript wrappers",
    source: `const severity = "warn" as const;
      const rules = { "current/no-throw": [severity], "legacy/no-throw": 2 } as const;
      const config = { rules } satisfies object;
      export default config;`,
    target: "oxlint.config.ts",
    count: 1,
  },
  {
    name: "checks each override on its own without inferring overlap across scopes",
    source: `export default {
      rules: { "current/no-throw": "error" },
      overrides: [
        { files: ["one.ts"], rules: { "legacy/no-throw": "error" } },
        { files: ["two.ts"], rules: { ${both} } },
        { files: ["three.ts"], rules: { "current/no-switch": 0, "legacy/no-switch": 2 } },
      ],
    };`,
    target: "oxlint.config.mjs",
    count: 1,
  },
  {
    name: "respects disabled or absent owners in scalar and array forms",
    source: `import { defineConfig } from "oxlint";
      defineConfig({ rules: { "legacy/no-throw": 2 } });
      defineConfig({ rules: { "current/no-throw": "off", "legacy/no-throw": 2 } });
      defineConfig({ rules: { "current/no-throw": 0, "legacy/no-throw": 2 } });
      defineConfig({ rules: { "current/no-throw": ["off", {}], "legacy/no-throw": 2 } });
      defineConfig({ rules: { "current/no-throw": [0], "legacy/no-throw": 2 } });
      defineConfig({ rules: { "current/no-throw": "allow", "legacy/no-throw": 2 } });`,
    target: "oxlint.config.ts",
    count: 0,
  },
  {
    name: "respects disabled redundant registrations and unknown severities",
    source: `import { defineConfig } from "oxlint"; import { unknown } from "./settings";
      defineConfig({ rules: { "current/no-throw": 2, "legacy/no-throw": "off" } });
      defineConfig({ rules: { "current/no-throw": 2, "legacy/no-throw": [0] } });
      defineConfig({ rules: { "current/no-throw": unknown, "legacy/no-throw": 2 } });
      defineConfig({ rules: { "current/no-throw": 2, "legacy/no-throw": [unknown] } });
      defineConfig({ rules: { "current/no-throw": [[2]], "legacy/no-throw": 2 } });`,
    target: "oxlint.config.ts",
    count: 0,
  },
  {
    name: "uses the final known duplicate property value",
    source: `import { defineConfig } from "oxlint";
      defineConfig({ rules: { ${both}, "current/no-throw": 0 } });
      defineConfig({ rules: { ${both}, "legacy/no-throw": ["off"] } });
      defineConfig({ rules: { "current/no-throw": 0, ${both} } });`,
    target: "oxlint.config.ts",
    count: 1,
  },
  {
    name: "invalidates earlier facts at opaque spreads and keys but retains later explicit settings",
    source: `import { defineConfig } from "oxlint"; import { unknown, key } from "./settings";
      defineConfig({ rules: { ${both}, ...unknown } });
      defineConfig({ rules: { ...unknown, ${both} } });
      defineConfig({ rules: { ${both}, [key]: 0 } });
      defineConfig({ rules: { [key]: 0, ${both} } });
      defineConfig({ rules: { ...{ ${both} } } });
      defineConfig({ ...unknown, rules: { ${both} } });
      defineConfig({ rules: { ${both} }, ...unknown });`,
    target: "oxlint.config.ts",
    count: 3,
  },
  {
    name: "does not merge extends, overrides or separate configurations",
    source: `import { defineConfig } from "oxlint";
      defineConfig({ extends: [{ rules: { "current/no-throw": 2 } }], rules: { "legacy/no-throw": 2 } });
      defineConfig({ rules: { "current/no-throw": 2 }, overrides: [{ files: ["one.ts"], rules: { "legacy/no-throw": 2 } }] });
      defineConfig({ rules: { "current/no-throw": 2 } });
      defineConfig({ rules: { "legacy/no-throw": 2 } });`,
    target: "oxlint.config.ts",
    count: 0,
  },
  {
    name: "ignores unrelated rules objects even in a config file",
    source: `import { defineConfig } from "oxlint";
      const unrelated = { rules: { ${both} } };
      const read = () => ({ rules: { ${both} } });
      export default defineConfig({ settings: { rules: { ${both} } } });`,
    target: "oxlint.config.ts",
    count: 0,
  },
  {
    name: "does not treat an arbitrary module's default object as Oxlint configuration",
    source: `export default { rules: { ${both} } };`,
    target: "unrelated.ts",
    count: 0,
  },
  {
    name: "checks import identity and respects shadowed helper and namespace bindings",
    source: `import { defineConfig } from "oxlint"; import * as Oxlint from "oxlint";
      import { defineConfig as foreign } from "other";
      foreign({ rules: { ${both} } });
      function local(defineConfig, Oxlint) {
        defineConfig({ rules: { ${both} } });
        return Oxlint.defineConfig({ rules: { ${both} } });
      }
      const fake = { defineConfig: (value) => value };
      export default fake.defineConfig({ rules: { ${both} } });`,
    target: "oxlint.config.ts",
    count: 0,
  },
  {
    name: "does not resolve imports, mutated objects or constants exposed to opaque work",
    source: `import { defineConfig } from "oxlint"; import { rules, config } from "./settings";
      defineConfig(config);
      defineConfig({ rules });
      const changed = { ${both} }; changed["current/no-throw"] = "off";
      defineConfig({ rules: changed });
      const escaped = { ${both} }; alter(escaped);
      defineConfig({ rules: escaped });
      let mutable = { ${both} }; defineConfig({ rules: mutable });`,
    target: "oxlint.config.ts",
    count: 0,
  },
  {
    name: "does not infer unconfigured pairs",
    source: `export default { rules: { "one/no-throw": 2, "two/no-throw": 2 } };`,
    target: "oxlint.config.ts",
    count: 0,
  },
];

describe("explicit redundant lint registrations", () => {
  it.effect.each(cases)(
    "$name",
    ({ source, target, count }) =>
      Effect.gen(function* () {
        const result = yield* lint(source, target);
        expect(result.files, result.stderr).toBe(1);
        expect(result.diagnostics, result.stdout).toHaveLength(count);
        expect(result.exitCode, result.stderr || result.stdout).toBe(count === 0 ? 0 : 1);
        Array.forEach(result.diagnostics, ({ message }) => {
          expect(message).toContain("current/");
          expect(message).toContain("legacy/");
        });
      }).pipe(Effect.provide(NodeServices.layer)),
    30_000,
  );

  it.effect("deduplicates identical configured pairs and ignores self pairs", () =>
    Effect.gen(function* () {
      const result = yield* lint(`export default { rules: { ${both} } };`, "oxlint.config.ts", [
        "error",
        {
          pairs: [
            throwPair,
            throwPair,
            { owner: "current/no-throw", redundant: "current/no-throw" },
          ],
        },
      ]);
      expect(result.diagnostics).toHaveLength(1);
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("reports absent and malformed consumer overlap settings", () =>
    Effect.gen(function* () {
      const source = `export default { rules: { ${both} } };`;
      const absent = yield* lint(source, "oxlint.config.ts", "error");
      expect(absent.diagnostics).toHaveLength(1);
      Array.forEach(absent.diagnostics, ({ message }) =>
        expect(message).toContain("Configure exact owner/redundant"),
      );
      const malformed = yield* lint(source, "oxlint.config.ts", [
        "error",
        { pairs: [{ owner: "not a rule id", redundant: "legacy/no-throw" }] },
      ]);
      expect(malformed.diagnostics).toHaveLength(1);
      Array.forEach(malformed.diagnostics, ({ message }) =>
        expect(message).toContain("Configure exact owner/redundant"),
      );
    }).pipe(Effect.provide(NodeServices.layer)),
  );
});
