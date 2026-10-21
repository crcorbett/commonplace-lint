import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, it } from "@effect/vitest";
import { Array, Effect, FileSystem, Schema, Stream } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/process";

const repository = new URL("../../", import.meta.url).pathname;
const Report = Schema.fromJsonString(
  Schema.Struct({
    diagnostics: Schema.Array(Schema.Struct({ code: Schema.String, filename: Schema.String })),
    number_of_files: Schema.Int,
  }),
);

it.effect("limits unstable Effect API permissions to named test APIs and test files", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const directory = yield* fs.makeTempDirectoryScoped({
      directory: `${repository}tools/oxlint`,
      prefix: "effect-policy-",
    });
    const fixtures = [
      {
        file: "allowed.test.ts",
        source:
          'import { FileSystem } from "effect"; export const storage = FileSystem.FileSystem;',
      },
      {
        file: "outside.ts",
        source:
          'import { FileSystem } from "effect"; export const storage = FileSystem.FileSystem;',
      },
      {
        file: "unlisted.test.ts",
        source:
          'import { FileSystem } from "effect"; export const storage = FileSystem.makeNoop({});',
      },
    ];
    yield* Effect.forEach(fixtures, ({ file, source }) =>
      fs.writeFileString(`${directory}/${file}`, source),
    );
    const child = yield* spawner.spawn(
      ChildProcess.make(
        `${repository}node_modules/.bin/oxlint`,
        [
          "--deny-warnings",
          "--format",
          "json",
          ...Array.map(fixtures, ({ file }) => `${directory}/${file}`),
        ],
        { cwd: repository, stdout: "pipe", stderr: "pipe" },
      ),
    );
    const read = (stream: typeof child.stdout) =>
      stream.pipe(
        Stream.decodeText,
        Stream.runFold(
          () => "",
          (text, chunk) => text + chunk,
        ),
      );
    const result = yield* Effect.all(
      {
        exitCode: child.exitCode,
        stdout: read(child.stdout),
        stderr: read(child.stderr),
      },
      { concurrency: "unbounded" },
    );
    expect(result.exitCode, result.stderr || result.stdout).toBe(1);
    const report = yield* Schema.decodeEffect(Report)(result.stdout);
    expect(report.number_of_files).toBe(3);
    expect(report.diagnostics).toHaveLength(2);
    Array.forEach(["outside.ts", "unlisted.test.ts"], (file) =>
      expect(
        Array.some(
          report.diagnostics,
          (diagnostic) =>
            diagnostic.filename.endsWith(file) &&
            diagnostic.code === "effecttsgo(unstable-api-usage)",
        ),
        file,
      ).toBe(true),
    );
  }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
);
