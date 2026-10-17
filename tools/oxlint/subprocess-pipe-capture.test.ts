import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, it } from "@effect/vitest";
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
const lint = Effect.fnUntraced(function* (source: string) {
  const fs = yield* FileSystem.FileSystem;
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  return yield* Effect.scoped(
    Effect.gen(function* () {
      const directory = yield* fs.makeTempDirectoryScoped({ prefix: "subprocess-pipe-capture-" });
      yield* fs.writeFileString(`${directory}/fixture.ts`, source);
      yield* fs.writeFileString(
        `${directory}/oxlint.json`,
        yield* Schema.encodeEffect(Configuration)({
          jsPlugins: [`${root}packages/oxlint-plugin/dist/strict-effect.js`],
          rules: {
            "strict-effect/subprocess-pipe-capture": "error",
            "no-unused-vars": "off",
            "no-dupe-keys": "off",
          },
        }),
      );
      const handle = yield* spawner.spawn(
        ChildProcess.make(
          `${root}node_modules/.bin/oxlint`,
          ["--config", `${directory}/oxlint.json`, "--format", "json", "fixture.ts"],
          { cwd: directory, stdout: "pipe", stderr: "pipe" },
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
      expect(result.stderr).toBe("");
      expect(result.stdout, "Oxlint must return a structured diagnostic report").toMatch(/^\s*\{/);
      return {
        exitCode: result.exitCode,
        report: yield* Schema.decodeEffect(Report)(result.stdout),
      };
    }),
  );
});

const imports = `import { Effect, Stream, pipe } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/process";
`;
const program = (body: string) => `${imports}export const capture = Effect.gen(function* () {
const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
const handle = yield* spawner.spawn(command);
${body}
});`;

const rejected = [
  {
    name: "exit then both pipes",
    source: program(`const exit = yield* handle.exitCode;
const out = yield* handle.stdout.pipe(Stream.decodeText, Stream.runCollect);
const err = yield* handle.stderr.pipe(Stream.runDrain);
return { exit, out, err };`),
    reports: 2,
  },
  {
    name: "one pipe then the other",
    source: program(`yield* Stream.runCollect(handle.stdout);
yield* Stream.runDrain(handle.stderr);`),
    reports: 1,
  },
  {
    name: "Effect.all is sequential by default",
    source: program(`return yield* Effect.all({ exit: handle.exitCode,
stdout: handle.stdout.pipe(Stream.runCollect), stderr: handle.stderr.pipe(Stream.runCollect) });`),
    reports: 1,
  },
  {
    name: "insufficient explicit concurrency",
    source: program(`return yield* Effect.all([handle.exitCode, Stream.runCollect(handle.stdout),
Stream.runCollect(handle.stderr)], { concurrency: 2 });`),
    reports: 1,
  },
  {
    name: "all static jobs must start, including other work",
    source: program(`return yield* Effect.all([Effect.never, handle.exitCode,
Stream.runCollect(handle.stdout)], { concurrency: 2 });`),
    reports: 1,
  },
  {
    name: "named function and namespace aliases",
    source: `import { Effect as E, Stream as S } from "effect";
import { ChildProcessSpawner as Process } from "effect/process";
const all = E.all;
const { runCollect: drain } = S;
const limit = { concurrency: 1 };
export const capture = E.fn("Capture.run")(function* () {
  const service = yield* Process.ChildProcessSpawner;
  const child = yield* service.spawn(command);
  const handle = child;
  const exit = handle.exitCode;
  const output = drain(handle.stdout);
  const work = { exit, output };
  return yield* all(work, limit);
});`,
    reports: 1,
  },
  {
    name: "direct process module and destructured channel aliases",
    source: `import * as E from "effect/Effect";
import * as S from "effect/Stream";
import * as Process from "effect/process/ChildProcessSpawner";
export const capture = E.fnUntraced(function* () {
  const service = yield* Process.ChildProcessSpawner;
  const child = yield* service.spawn(command);
  const { exitCode: exit, stdout: output, stderr: error } = child;
  yield* exit;
  yield* output.pipe(S.runCollect);
  yield* error.pipe(S.runDrain);
});`,
    reports: 2,
  },
  {
    name: "separate exit before a concurrent pipe group",
    source: program(`yield* handle.exitCode;
return yield* Effect.all([Stream.runCollect(handle.stdout), Stream.runCollect(handle.stderr)], { concurrency: 2 });`),
    reports: 1,
  },
];
const accepted = [
  program(
    `const wait = yield* handle.exitCode.pipe(Effect.succeed); yield* Effect.all([Stream.runCollect(handle.stdout), Stream.runCollect(handle.stderr)], { concurrency: 2 }); return yield* wait;`,
  ),
  program(
    `const wait = yield* pipe(handle.exitCode, Effect.succeed); yield* Effect.all([Stream.runCollect(handle.stdout), Stream.runCollect(handle.stderr)], { concurrency: 2 }); return yield* wait;`,
  ),
  program(
    `const deferred = yield* handle.stdout.pipe(Stream.runCollect, Effect.succeed); yield* Effect.all([deferred, Stream.runCollect(handle.stderr), handle.exitCode], { concurrency: 3 });`,
  ),
  program(
    `const wait = yield* Effect.as(Effect.void, handle.exitCode); yield* Effect.all([Stream.runCollect(handle.stdout), Stream.runCollect(handle.stderr)], { concurrency: 2 }); return yield* wait;`,
  ),
  program(
    `const wait = yield* Effect.void.pipe(Effect.as(handle.exitCode)); yield* Effect.all([Stream.runCollect(handle.stdout), Stream.runCollect(handle.stderr)], { concurrency: 2 }); return yield* wait;`,
  ),
  program(
    `const stream = yield* Stream.runFold(handle.stdout, () => handle.stderr, (state) => state); return yield* Effect.succeed(stream);`,
  ),
  program(
    `yield* Effect.all([Stream.runCollect(handle.stdout), Stream.runCollect(handle.stderr)], { concurrency: 2 }); return yield* handle.exitCode;`,
  ),
  program(
    `return yield* Effect.all([Stream.runCollect(handle.stdout), Stream.runCollect(handle.stderr), handle.exitCode], { concurrency: 2 });`,
  ),
  program(
    `return yield* Effect.all([Stream.runCollect(handle.stdout), Stream.runCollect(handle.stderr), handle.exitCode, Effect.never], { concurrency: 3 });`,
  ),
  program(
    `yield* handle.exitCode; yield* Stream.runCollect(handle.stdout); yield* Stream.runCollect(handle.stderr);`,
  ).replace(
    "spawner.spawn(command)",
    `spawner.spawn(ChildProcess.make("binary", [], { stdout: "inherit", stderr: "ignore" }))`,
  ),
  program(
    `yield* handle.exitCode; yield* Stream.runCollect(handle.stdout); yield* Stream.runCollect(handle.stderr);`,
  ).replace(
    "spawner.spawn(command)",
    `spawner.spawn(ChildProcess.make("binary", { stdout: { stream: "ignore" }, stderr: { stream: "inherit" } }))`,
  ),
  program(`yield* Stream.runCollect(handle.stdout); return yield* handle.exitCode;`).replace(
    "spawner.spawn(command)",
    `spawner.spawn(ChildProcess.make("binary", [], { stderr: "ignore" }))`,
  ),
  program(
    `yield* handle.exitCode; yield* Stream.runCollect(handle.stdout); yield* Stream.runCollect(handle.stderr);`,
  ).replace(
    "spawner.spawn(command)",
    'spawner.spawn(ChildProcess.make({ stdout: "inherit", stderr: "ignore" })`binary`)',
  ),
  program(`return yield* Effect.all({ exit: handle.exitCode,
stdout: handle.stdout.pipe(Stream.runCollect), stderr: handle.stderr.pipe(Stream.runCollect) }, { concurrency: "unbounded" });`),
  program(`return yield* Effect.all([handle.exitCode, Stream.runCollect(handle.stdout),
Stream.runCollect(handle.stderr)], { concurrency: 3 });`),
  program(`return yield* Effect.all([handle.stdout.pipe(Stream.runCollect),
handle.stderr.pipe(Stream.runCollect)], { concurrency: 2 });`),
  program(`yield* Effect.all([handle.exitCode, Stream.runCollect(handle.stdout), Stream.runCollect(handle.stderr)], { concurrency: 3 });
return yield* handle.exitCode;`),
  program(`const output = yield* handle.stdout.pipe(Stream.runCollect, Effect.forkChild);
const error = yield* handle.stderr.pipe(Stream.runCollect, Effect.forkChild);
return yield* handle.exitCode;`),
  program(`const result = handle.stdout.pipe(Stream.decodeText);
return yield* Effect.succeed(result);`),
];
const unrelated = [
  `${imports}const spawner = { spawn: () => unrelated };
export const ordinary = Effect.gen(function* () { const child = yield* spawner.spawn(command);
yield* child.exitCode; yield* child.stdout.pipe(Stream.runCollect); });`,
  `import { Effect, Stream } from "other-effect";
import { ChildProcessSpawner } from "other-process";
export const ordinary = Effect.gen(function* () { const service = yield* ChildProcessSpawner.ChildProcessSpawner;
const child = yield* service.spawn(command); yield* child.exitCode; yield* child.stdout.pipe(Stream.runCollect); });`,
  `import { Effect, Stream } from "effect";
import type { ChildProcessSpawner } from "effect/process";
export const ordinary = Effect.gen(function* () { const service = yield* ChildProcessSpawner.ChildProcessSpawner;
const child = yield* service.spawn(command); yield* child.exitCode; yield* child.stdout.pipe(Stream.runCollect); });`,
  `${imports}const outer = yieldable;
export const ordinary = (ChildProcessSpawner: typeof outer) => Effect.gen(function* () {
const service = yield* ChildProcessSpawner.ChildProcessSpawner;
const child = yield* service.spawn(command); yield* child.exitCode; yield* child.stdout.pipe(Stream.runCollect); });`,
  program(
    `return yield* ((Stream: typeof other) => Effect.all([handle.exitCode, handle.stdout.pipe(Stream.runCollect)]))(other);`,
  ),
  program(
    `return yield* ((Effect: typeof other) => Effect.all([handle.exitCode, handle.stdout.pipe(Stream.runCollect)]))(other);`,
  ),
  `${imports}type ProcessHandle = { readonly exitCode: unknown; readonly stdout: unknown };
export const ordinary = (handle: ProcessHandle) => Effect.gen(function* () {
yield* handle.exitCode; yield* Stream.runCollect(handle.stdout); });`,
];
const unclassified = [
  program(
    `const deferred = yield* handle.stdout.pipe(Stream.runCollect, () => Effect.void); yield* Stream.runCollect(handle.stderr);`,
  ),
  program(
    `const deferred = yield* handle.stdout.pipe(opaque, Stream.runCollect); yield* Stream.runCollect(handle.stderr);`,
  ),
  program(
    `const wait = yield* handle.exitCode.pipe(opaque); yield* Stream.runCollect(handle.stdout);`,
  ),
  program(
    `return yield* Effect.all({ '2': handle.exitCode, '0': Stream.runCollect(handle.stdout), '1': Stream.runCollect(handle.stderr) }, { concurrency: 2 });`,
  ),
  program(
    `const drain = Effect.map(drain, identity); return yield* Effect.all([handle.exitCode, drain]);`,
  ),
  program(
    `return yield* Effect.all({ work: handle.exitCode, work: Effect.succeed(1), out: Stream.runCollect(handle.stdout) });`,
  ),
  program(
    `return yield* Effect.all([handle.exitCode, Stream.runCollect(handle.stdout)], options);`,
  ),
  program(
    `return yield* Effect.all([handle.exitCode, Stream.runCollect(handle.stdout)], { concurrency: limit });`,
  ),
  program(
    `return yield* Effect.all([handle.exitCode, ...more, Stream.runCollect(handle.stdout)]);`,
  ),
  program(
    `return yield* Effect.all([handle.exitCode, Stream.runCollect(handle.stdout)], { ...options });`,
  ),
];

it.effect("rejects proven native sequential subprocess capture patterns", () =>
  Effect.forEach(
    rejected,
    ({ source, reports, name }) =>
      Effect.gen(function* () {
        const result = yield* lint(source);
        expect(result.exitCode, name).not.toBe(0);
        expect(result.report.number_of_files, name).toBe(1);
        expect(result.report.diagnostics, name).toHaveLength(reports);
        expect(
          Array.every(
            result.report.diagnostics,
            (diagnostic) => diagnostic.code === "strict-effect(subprocess-pipe-capture)",
          ),
          name,
        ).toBe(true);
      }),
    { concurrency: 1, discard: true },
  ).pipe(Effect.provide(NodeServices.layer)),
);
it.effect("accepts sufficient explicit concurrency and leaves fibre ownership to its caller", () =>
  Effect.forEach(
    accepted,
    (source) =>
      Effect.gen(function* () {
        const result = yield* lint(source);
        expect(result.exitCode).toBe(0);
        expect(result.report.diagnostics).toHaveLength(0);
      }),
    { concurrency: 1, discard: true },
  ).pipe(Effect.provide(NodeServices.layer)),
);
it.effect("ignores unrelated, type-only and shadowed imports or handles", () =>
  Effect.forEach(
    unrelated,
    (source) =>
      Effect.gen(function* () {
        const result = yield* lint(source);
        expect(result.exitCode).toBe(0);
        expect(result.report.diagnostics).toHaveLength(0);
      }),
    { concurrency: 1, discard: true },
  ).pipe(Effect.provide(NodeServices.layer)),
);
it.effect("does not claim to classify dynamic job lists or concurrency bounds", () =>
  Effect.forEach(
    unclassified,
    (source) =>
      Effect.gen(function* () {
        const result = yield* lint(source);
        expect(result.exitCode).toBe(0);
        expect(result.report.diagnostics).toHaveLength(0);
      }),
    { concurrency: 1, discard: true },
  ).pipe(Effect.provide(NodeServices.layer)),
);
