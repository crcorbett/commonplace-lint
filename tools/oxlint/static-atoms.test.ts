import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, it } from "@effect/vitest";
import { Array, Effect, FileSystem, Record, Schema } from "effect";
import { command } from "../../packages/oxlint-plugin/test/command.js";

const root = new URL("../../", import.meta.url).pathname;
const Report = Schema.fromJsonString(
  Schema.Struct({
    diagnostics: Schema.Array(Schema.Struct({ code: Schema.String, filename: Schema.String })),
    number_of_files: Schema.Int,
  }),
);
const Configuration = Schema.fromJsonString(
  Schema.Struct({
    jsPlugins: Schema.Array(Schema.String),
    rules: Schema.Record(Schema.String, Schema.String),
  }),
);

const lint = Effect.fnUntraced(function* (sources: Readonly<Record<string, string>>) {
  const fs = yield* FileSystem.FileSystem;
  const directory = yield* fs.makeTempDirectoryScoped({ prefix: "static-atoms-" });
  yield* Effect.forEach(Record.toEntries(sources), ([filename, source]) =>
    fs
      .makeDirectory(`${directory}/${filename.slice(0, filename.lastIndexOf("/"))}`, {
        recursive: true,
      })
      .pipe(Effect.andThen(fs.writeFileString(`${directory}/${filename}`, source))),
  );
  yield* fs.writeFileString(
    `${directory}/oxlint.json`,
    yield* Schema.encodeEffect(Configuration)({
      jsPlugins: [`${root}packages/oxlint-plugin/dist/strict-effect.js`],
      rules: { "strict-effect/static-atoms": "error", "no-unused-vars": "off" },
    }),
  );
  const result = yield* command(directory, `${root}node_modules/.bin/oxlint`, [
    "--config",
    "oxlint.json",
    "--format",
    "json",
    ...Record.keys(sources),
  ]);
  return { ...result, report: yield* Schema.decodeEffect(Report)(result.stdout) };
});

const imports = `import * as Atom from "effect/reactivity/Atom";
import { Atom as Native } from "effect/reactivity";
import { make as create } from "effect/reactivity/Atom";
import type { Atom as Readable, AtomRuntime } from "effect/reactivity/Atom";
import * as Effect from "effect/Effect";
import { pipe } from "effect/Function";
const input = Atom.make(0);
const runtime = Atom.runtime(layer);
`;
const factories = {
  arrow: "export const make = () => Atom.make(0);",
  declaration: "export function make() { return Atom.make(0); }",
  expression: "export const make = function () { return Atom.make(0); };",
  method: "export const factory = { make() { return Atom.make(0); } };",
  "namespace-alias": "const Alias = Native; export const make = () => Alias.make(0);",
  "named-alias": "const alias = create; export const make = () => alias(0);",
  destructured: "const { make: alias } = Atom; export const make = () => alias(0);",
  computed: "export const make = () => Atom['make'](0);",
  "static-return": "export const make = () => input;",
  "local-result": "export const make = () => { const selected = Atom.make(0); return selected; };",
  piped: "export const make = () => Atom.make(0).pipe(Atom.keepAlive);",
  "functional-pipe": "export const make = () => pipe(input, Atom.map((value) => value + 1));",
  curried: "export const make = () => Atom.map((value) => value + 1)(input);",
  action: "export const make = () => Atom.fn<number>()((value) => Effect.succeed(value));",
  "typed-return": "export const make = (): Readable<number> => foreign();",
  "type-alias": "type Value = Readable<number>; export const make = (): Value => foreign();",
  signature: "export type Factory = () => Readable<number>;",
  "method-signature": "export interface Factory { make(): Readable<number> }",
  "call-signature": "export interface Factory { (): Readable<number> }",
  "runtime-atom": "export const make = () => runtime.atom(Effect.succeed(0));",
  "runtime-parameter":
    "export const make = (host: AtomRuntime<never>) => host.atom(Effect.succeed(0));",
  "runtime-action":
    "export const make = () => runtime.fn<number>()((value) => Effect.succeed(value));",
  "runtime-alias":
    "const alias = runtime; const build = alias.atom; export const make = () => build(Effect.succeed(0));",
  "runtime-destructured":
    "export const make = (host: AtomRuntime<never>) => { const { atom: create } = host; return create(Effect.succeed(0)); };",
  // The removed PostHog helper: runtime injection is still an Atom factory.
  posthogRuntimeInjection:
    "export const makePostHogBrowserAtom = (host: AtomRuntime<never>) => host.atom((get) => get.result(configuration).pipe(Effect.flatMap(configure))).pipe(Atom.keepAlive);",
  branch: "export const make = (ready) => { if (ready) return input; return Atom.make(1); };",
  switch:
    "export const make = (kind) => { switch (kind) { case 1: return input; default: return Atom.make(1); } };",
  "nested-return": "export const make = () => { try { return input; } finally { cleanup(); } };",
  "opaque-callback": "export const make = foreign(() => Atom.make(0));",
  "family-factory": "export const make = () => Atom.family((key: string) => Atom.make(key));",
  "fake-family":
    "const fake = { family: (callback) => callback }; export const make = fake.family(() => Atom.make(0));",
  "host-construction":
    'import { createIsomorphicFn } from "@tanstack/react-start"; export const selected = createIsomorphicFn().client(() => Atom.make(0));',
  "fake-host-selector":
    'import { createIsomorphicFn } from "./foreign"; export const selected = createIsomorphicFn().server(() => input);',
};

it.effect("rejects owned Atom factories, including the PostHog runtime-injection regression", () =>
  Effect.gen(function* () {
    const cases = Array.map(
      Record.toEntries(factories),
      ([name, source]) => [`packages/example/src/${name}.ts`, imports + source] as const,
    );
    const regression = imports + factories.posthogRuntimeInjection;
    const sources = Record.fromEntries([
      ...cases,
      ["apps/web/src/factory.ts", regression],
      ["packages/example/test/factory.ts", regression],
      ["tools/factory.ts", regression],
      ["config/factory.config.ts", regression],
    ]);
    const { exitCode, stdout, stderr, report } = yield* lint(sources);
    expect(exitCode, stderr || stdout).toBe(1);
    expect(report.number_of_files).toBe(Record.keys(sources).length);
    expect(report.diagnostics).toHaveLength(Record.keys(sources).length);
    Array.forEach(Record.keys(sources), (filename) => {
      expect(Array.filter(report.diagnostics, (entry) => entry.filename === filename)).toEqual([
        { code: "strict-effect(static-atoms)", filename },
      ]);
    });
  }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
);

it.effect("accepts static scoped definitions, native families, actions and shadowed names", () =>
  Effect.gen(function* () {
    const { exitCode, stdout, stderr, report } = yield* lint({
      "packages/example/src/atom.ts":
        imports +
        `
export const binding = Atom.make(Option.none()).pipe(Atom.keepAlive);
export const resource = Atom.make((get) => get.result(configuration).pipe(Effect.flatMap(configure)));
export const service = runtime.atom((get) => get.result(resource));
export const action = runtime.fn<number>()((value, get) => Effect.succeed(value + get(input)));
export const keyed = Atom.family((key: string) => Atom.make(key));
const { family } = Atom;
export const aliasedFamily = family((key: string) => { return Atom.make(key).pipe(Atom.keepAlive); });
export const keyedService = Atom.family((key: string) => runtime.atom(Effect.succeed(key)));
export const transform = Atom.map((value: number) => value + 1);
export const derive = () => Atom.map((value: number) => value + 1);
export const partialTransform = () => Atom.transform((get, atom) => get(atom), { initialValueTarget: input });
export const optimistic = Atom.optimistic(input).pipe(Atom.optimisticFn({ reducer, fn: (set) => Atom.fn(run(set)) }));
export const read = () => Atom.get(input);
export const seeded = () => input.pipe(Atom.initialValue(1));
export const stream = () => input.pipe(Atom.toStream);
export const selection = (key: string) => keyed(key);
export const shadowed = (Atom) => Atom.make(0);
export const shadowedRuntime = (runtime) => runtime.atom(0);
export const lexical = () => { const Atom = other; return Atom.make(0); };
export const plain = { make: () => 1 };
import { createIsomorphicFn as selectHost } from "@tanstack/react-start";
export const hostAtom = selectHost().client(() => input).server(() => input);
`,
      "apps/web/src/runtime.client.ts": `import * as Atom from "effect/reactivity/Atom";
import * as AtomRegistry from "effect/reactivity/AtomRegistry";
export const binding = Atom.make(Option.none());
export const browserRuntime = Atom.runtime(layer);
export const createLoaderRegistry = () => AtomRegistry.make({ initialValues: [[binding, checkedBinding]] });
`,
    });
    expect(exitCode, stderr || stdout).toBe(0);
    expect(report.number_of_files).toBe(2);
    expect(report.diagnostics).toEqual([]);
  }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
);
