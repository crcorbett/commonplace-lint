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

// Exercise the compiled plugin in the real host, including lexical scopes and
// exact owner paths. All generated sources stay in a scoped temporary directory.
const lint = Effect.fnUntraced(function* (
  rule: string,
  source: string,
  options: Schema.Json = null,
  target = "packages/example/test/source.test.ts",
) {
  const fs = yield* FileSystem.FileSystem;
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  return yield* Effect.scoped(
    Effect.gen(function* () {
      const temporary = yield* fs.makeTempDirectoryScoped({ prefix: "site-lint-regressions-" });
      const filename = `${temporary}/${target}`;
      yield* fs.makeDirectory(filename.slice(0, filename.lastIndexOf("/")), { recursive: true });
      yield* fs.writeFileString(filename, source);
      const configuration = `${temporary}/oxlint.json`;
      yield* fs.writeFileString(
        configuration,
        yield* Schema.encodeEffect(Configuration)({
          jsPlugins: [`${root}packages/oxlint-plugin/dist/strict-effect.js`],
          rules: {
            [`strict-effect/${rule}`]: options === null ? "error" : ["error", options],
          },
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
          stdout: handle.stdout.pipe(Stream.decodeText, Stream.mkString),
          stderr: handle.stderr.pipe(Stream.decodeText, Stream.mkString),
        },
        { concurrency: "unbounded" },
      );
      const report = yield* Schema.decodeEffect(Report)(result.stdout);
      return {
        exitCode: result.exitCode,
        files: report.number_of_files,
        count: Array.filter(report.diagnostics, ({ code }) => code === `strict-effect(${rule})`)
          .length,
      };
    }),
  );
});

const runtimeTypeCalls = [
  'import { expectTypeOf } from "vitest"; expectTypeOf<number>(1).toEqualTypeOf<number>();',
  'import { assertType as check } from "@effect/vitest"; check<number>(1);',
  'import * as Tests from "vitest"; Tests.expectTypeOf<number>(1);',
  'import * as Tests from "@effect/vitest"; Tests["assertType"]<number>(1);',
  'import { expectTypeOf } from "vitest"; const alias = expectTypeOf; alias<number>(1);',
  'import * as Tests from "vitest"; const toolkit = Tests; const { assertType: check } = toolkit; check<number>(1);',
];

it.effect(
  "runtime tests reject imported type assertions and immutable aliases, leaving compile-only files valid",
  () =>
    Effect.forEach(
      runtimeTypeCalls,
      (source) =>
        Effect.gen(function* () {
          yield* Effect.forEach(
            ["example.test.ts", "example.spec.tsx", "example.test.mts"],
            (target) =>
              Effect.gen(function* () {
                const result = yield* lint("no-runtime-type-assertions", source, null, target);
                expect(result.files, source).toBe(1);
                expect(result.count, source).toBe(1);
              }),
            { concurrency: 1, discard: true },
          );
          yield* Effect.forEach(
            ["example.typecheck.ts", "example.test-d.ts"],
            (target) =>
              Effect.gen(function* () {
                const result = yield* lint("no-runtime-type-assertions", source, null, target);
                expect(result.files, source).toBe(1);
                expect(result.count, source).toBe(0);
              }),
            { concurrency: 1, discard: true },
          );
        }),
      { concurrency: 1, discard: true },
    ).pipe(Effect.provide(NodeServices.layer)),
  120_000,
);

it.effect(
  "type assertion detection respects nearest bindings and untrusted or mutable aliases",
  () =>
    Effect.forEach(
      [
        "const expectTypeOf = (value: number) => value; expectTypeOf(1);",
        'import { expectTypeOf } from "other-tests"; expectTypeOf(1);',
        'import { expectTypeOf } from "vitest"; export const check = (expectTypeOf: (value: number) => number) => expectTypeOf(1);',
        'import * as Tests from "vitest"; export const check = (Tests: { assertType: (value: number) => number }) => Tests.assertType(1);',
        'import { assertType } from "vitest"; { const assertType = (value: number) => value; assertType(1); }',
        'import { assertType } from "vitest"; let check = assertType; check = (value: number) => value; check(1);',
        'import * as Tests from "vitest"; const expectTypeOf = "foreign"; const { [expectTypeOf]: check } = Tests; check(1);',
        'import { expect } from "@effect/vitest"; expect(1).toBe(1);',
      ],
      (source) =>
        Effect.gen(function* () {
          const result = yield* lint("no-runtime-type-assertions", source);
          expect(result.files, source).toBe(1);
          expect(result.count, source).toBe(0);
        }),
      { concurrency: 1, discard: true },
    ).pipe(Effect.provide(NodeServices.layer)),
  60_000,
);

const hostOptions = {
  hosts: ["example.com"],
  allowedFiles: ["packages/platform/src/site-address.ts"],
  allowTestFiles: false,
  allowTestAssertions: true,
};

it.effect(
  "host assertions allow imported expected-value oracles through immutable aliases and static data",
  () =>
    Effect.forEach(
      [
        'import { expect } from "vitest"; expect(actual).toBe("https://example.com/");',
        'import { expect as check } from "@effect/vitest"; check(actual).not.toEqual({ url: "https://example.com/" });',
        'import * as Tests from "vitest"; Tests.expect(actual).resolves.toStrictEqual(["https://example.com/"]);',
        'import { expect } from "vitest"; const check = expect; check(actual).rejects.toMatch(/example\\.com/u);',
        'import { expect } from "vitest"; expect.soft(actual).toContain(`https://example.com/${id}`);',
        'import * as Tests from "@effect/vitest"; const { expect: check } = Tests; check(actual).toBe("https://example.com/");',
        'import { assert } from "@effect/vitest"; assert.strictEqual(actual, "https://example.com/");',
        'import * as Tests from "vitest"; Tests.assert.deepStrictEqual(actual, { url: "https://example.com/" });',
        'import { assert as check } from "vitest"; const alias = check; alias.include(actual, "example.com");',
        'import { assert } from "vitest"; const equal = assert.strictEqual; equal(actual, "https://example.com/");',
        'import { assert } from "vitest"; const { strictEqual: equal } = assert; equal(actual, "https://example.com/");',
        'import { expect } from "vitest"; expect(actual).toEqual({ "https://example.com/": 1 });',
        'import { expect } from "vitest"; expect(actual).toEqual({ ["https://example.com/"]: 1 });',
      ],
      (source) =>
        Effect.gen(function* () {
          const result = yield* lint("public-host-literals", source, hostOptions);
          expect(result.files, source).toBe(1);
          expect(result.count, source).toBe(0);
        }),
      { concurrency: 1, discard: true },
    ).pipe(Effect.provide(NodeServices.layer)),
  90_000,
);

it.effect(
  "host setup, actual arguments, constructors and untrusted assertions remain checked",
  () =>
    Effect.forEach(
      [
        'export const source = "---\\ncanonical: https://example.com/\\n---";',
        'import { expect } from "vitest"; expect("https://example.com/").toBe(actual);',
        'import { assert } from "vitest"; assert.strictEqual("https://example.com/", actual);',
        'import { assert } from "vitest"; assert.strictEqual(actual, expected, "https://example.com/");',
        'import { assert } from "vitest"; assert.fail("https://example.com/");',
        'import { expect } from "vitest"; expect.unreachable("https://example.com/");',
        'import { expect } from "vitest"; expect(actual, "https://example.com/").toBe(expected);',
        'import { expect } from "vitest"; expect(actual).toEqual(new URL("https://example.com/"));',
        'import { expect } from "vitest"; expect(actual).toEqual(parse("https://example.com/"));',
        'import { expect } from "vitest"; expect(actual).toEqual(() => "https://example.com/");',
        'import { expect } from "vitest"; expect(actual).toEqual({ get "https://example.com/"() { return 1; } });',
        'import { expect } from "vitest"; expect(actual).toEqual({ [parse("https://example.com/")]: 1 });',
        'import { expect } from "vitest"; expect(actual).toEqual({ ["https://example.com/" + suffix]: 1 });',
        'import { expect } from "vitest"; expect(actual).customMatcher("https://example.com/");',
        'import { expect } from "other-tests"; expect(actual).toBe("https://example.com/");',
        'import { expect } from "vitest"; export const check = (expect: any) => expect(actual).toBe("https://example.com/");',
        'import { assert } from "@effect/vitest"; export const check = (assert: any) => assert.strictEqual(actual, "https://example.com/");',
        'import * as Tests from "vitest"; export const check = (Tests: any) => Tests.assert.strictEqual(actual, "https://example.com/");',
        'const assert = { strictEqual: (...args: unknown[]) => args }; assert.strictEqual(actual, "https://example.com/");',
        'import { assert } from "vitest"; let check = assert; check = foreign; check.strictEqual(actual, "https://example.com/");',
        'import * as Tests from "vitest"; const expect = "foreign"; const { [expect]: check } = Tests; check(actual).toBe("https://example.com/");',
        'import { assert } from "vitest"; const strictEqual = "foreign"; const { [strictEqual]: equal } = assert; equal(actual, "https://example.com/");',
      ],
      (source) =>
        Effect.gen(function* () {
          const result = yield* lint("public-host-literals", source, hostOptions);
          expect(result.files, source).toBe(1);
          expect(result.count, source).toBe(1);
        }),
      { concurrency: 1, discard: true },
    ).pipe(Effect.provide(NodeServices.layer)),
  120_000,
);

it.effect(
  "host assertion exceptions are opt-in and test-only, preserving legacy whole-test exemptions",
  () =>
    Effect.gen(function* () {
      const oracle =
        'import { expect } from "vitest"; expect(actual).toBe("https://example.com/");';
      yield* Effect.forEach(
        [
          { ...hostOptions, allowTestAssertions: false },
          {
            hosts: hostOptions.hosts,
            allowedFiles: hostOptions.allowedFiles,
            allowTestFiles: false,
          },
        ],
        (options) =>
          Effect.gen(function* () {
            const result = yield* lint("public-host-literals", oracle, options);
            expect(result.count).toBe(1);
          }),
        { concurrency: 1, discard: true },
      );
      const ordinary = yield* lint(
        "public-host-literals",
        oracle,
        hostOptions,
        "packages/example/src/source.ts",
      );
      expect(ordinary.count).toBe(1);
      const legacy = yield* lint(
        "public-host-literals",
        'const fixture = "https://example.com/";',
        { ...hostOptions, allowTestFiles: true },
      );
      expect(legacy.count).toBe(0);
    }).pipe(Effect.provide(NodeServices.layer)),
  60_000,
);

it.effect(
  "canonical declarations restrict exact top-level const owners without granting neighbouring or nested exceptions",
  () =>
    Effect.gen(function* () {
      const owner = "packages/platform/src/site-address.ts";
      const options = {
        ...hostOptions,
        allowedDeclarations: [{ file: owner, names: ["siteHostName"] }],
      };
      const canonical = yield* lint(
        "public-host-literals",
        'export const siteHostName = HostName.make("example.com"); export const api = HostName.make(`api.${siteHostName}`); export const www = HostName.make(`www.${siteHostName}`);',
        options,
        owner,
      );
      expect(canonical.count).toBe(0);
      const duplicate = yield* lint(
        "public-host-literals",
        'export const siteHostName = HostName.make("example.com"); export const api = HostName.make("api.example.com"); export const www = HostName.make("www.example.com");',
        options,
        owner,
      );
      expect(duplicate.count).toBe(2);
      yield* Effect.forEach(
        [
          'export const wrongName = "example.com";',
          'export function build() { const siteHostName = "example.com"; return siteHostName; }',
          'export function siteHostName() { return "example.com"; }',
          'export const siteHostName = () => "example.com";',
        ],
        (source) =>
          Effect.gen(function* () {
            const result = yield* lint("public-host-literals", source, options, owner);
            expect(result.count, source).toBe(1);
          }),
        { concurrency: 1, discard: true },
      );
      const unknownOwner = yield* lint(
        "public-host-literals",
        'export const siteHostName = "example.com";',
        options,
        "packages/platform/src/other.ts",
      );
      expect(unknownOwner.count).toBe(1);
      const ungrantedOwner = yield* lint(
        "public-host-literals",
        'export const siteHostName = "example.com";',
        { ...options, allowedFiles: [] },
        owner,
      );
      expect(ungrantedOwner.count).toBe(1);
      const legacyOwner = yield* lint(
        "public-host-literals",
        'export const api = "api.example.com";',
        hostOptions,
        owner,
      );
      expect(legacyOwner.count).toBe(0);
    }).pipe(Effect.provide(NodeServices.layer)),
  90_000,
);
