import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, it } from "@effect/vitest";
import { Effect, FileSystem, Schema, Stream } from "effect";
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
      const directory = yield* fs.makeTempDirectoryScoped({
        prefix: "http-client-error-classification-",
      });
      yield* fs.writeFileString(`${directory}/fixture.ts`, source);
      yield* fs.writeFileString(
        `${directory}/oxlint.json`,
        yield* Schema.encodeEffect(Configuration)({
          jsPlugins: [`${root}packages/oxlint-plugin/dist/strict-effect.js`],
          rules: {
            "strict-effect/http-client-error-classification": "error",
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

const fixtureTimeout = 180_000;
const imports = `import { Match, Effect, Schema } from "effect";
class IntegrityError {} class Unavailable {}
`;
const table = (decode: string, transport = "() => new Unavailable({})") =>
  `{ DecodeError: ${decode}, TransportError: ${transport}, StatusCodeError: () => new Unavailable({}) }`;
const match = (decode: string, transport?: string) =>
  `${imports}export const map = error => Match.value(error.reason).pipe(Match.tagsExhaustive(${table(decode, transport)}));`;

const rejected = [
  match("() => new IntegrityError({})"),
  match("({ cause }) => new IntegrityError({ cause })"),
  match("() => { return new IntegrityError({}); }"),
  match("() => Effect.fail(new IntegrityError({}))", "() => Effect.fail(new Unavailable({}))"),
  `${imports}const bad = () => new IntegrityError({}); const read = bad;
export const map = Match.tags(${table("read")});`,
  `${imports}const bad = () => new IntegrityError({});
export const map = Match.tagsExhaustive(${table("() => bad()")});`,
  `import * as M from "effect/Match"; class IntegrityError {} class Unavailable {}
const cases = ${table("() => new IntegrityError({})")};
const check = M.tagsExhaustive; export const map = check(cases);`,
  `import { Match as M } from "effect";
import { Broken as IntegrityError, Missing as Unavailable } from "domain/errors";
export const map = M.tagsExhaustive(${table("() => new IntegrityError({})")});`,
];
const accepted = [
  match("() => new Unavailable({})"),
  match(
    "({ cause }) => Schema.is(BodyTooLarge)(cause) ? new IntegrityError({}) : new Unavailable({})",
  ),
  match(
    "({ cause }) => { if (Schema.is(BodyTooLarge)(cause)) return new IntegrityError({}); return new Unavailable({}); }",
  ),
  `${imports}const unavailable = () => new Unavailable({});
export const map = Match.tagsExhaustive(${table("unavailable", "unavailable")});`,
  `${imports}const Alias = Unavailable;
export const map = Match.tagsExhaustive(${table("() => new Alias({})")});`,
  `import { Match } from "effect"; import { Missing as A, Missing as B } from "domain/errors";
export const map = Match.tagsExhaustive(${table("() => new A({})", "() => new B({})")});`,
  `${imports}export const map = Match.tagsExhaustive({ DecodeError: () => new IntegrityError({}) });`,
  `import { Match } from "other-library"; class IntegrityError {} class Unavailable {}
export const map = Match.tagsExhaustive(${table("() => new IntegrityError({})")});`,
  `import type { Match } from "effect"; class IntegrityError {} class Unavailable {}
export const map = Match.tagsExhaustive(${table("() => new IntegrityError({})")});`,
  `${imports}export const map = (Match: Client) => Match.tagsExhaustive(${table("() => new IntegrityError({})")});`,
  `${imports}const decode = () => decode();
export const map = Match.tagsExhaustive(${table("decode")});`,
  `${imports}const Alias = chooseError();
export const map = Match.tagsExhaustive(${table("() => new Alias({})")});`,
];

it.effect(
  "rejects unconditional HTTP body-read misclassification through the actual binary",
  () =>
    Effect.forEach(rejected, (source) =>
      Effect.gen(function* () {
        const result = yield* lint(source);
        expect(result.exitCode, source).toBe(1);
        expect(result.report.number_of_files).toBe(1);
        expect(result.report.diagnostics).toEqual([
          { code: "strict-effect(http-client-error-classification)" },
        ]);
      }),
    ).pipe(Effect.provide(NodeServices.layer)),
  fixtureTimeout,
);
it.effect(
  "allows cause-specific classification and ignores unrelated or shadowed Match imports",
  () =>
    Effect.forEach(accepted, (source) =>
      Effect.gen(function* () {
        const result = yield* lint(source);
        expect(result.exitCode, source).toBe(0);
        expect(result.report.number_of_files).toBe(1);
        expect(result.report.diagnostics, source).toEqual([]);
      }),
    ).pipe(Effect.provide(NodeServices.layer)),
  fixtureTimeout,
);
