import type { Case } from "./conventions.cases";

export const serviceCompositionCases: readonly Case[] = [
  {
    plugin: "effect",
    rule: "no-redundant-operation-wrappers",
    invalid:
      'import { Effect } from "effect"; const read = Effect.fn("Read.get")(() => Effect.void); export const x = Effect.fn("Read.get")(read);',
    valid:
      'import { Effect } from "effect"; const read = Effect.fn(() => Effect.void); export const x = Effect.fn("Read.get")(read);',
  },
  {
    plugin: "effect",
    rule: "no-redundant-operation-wrappers",
    invalid:
      'import { Source } from "./service"; import { Effect } from "effect"; export const x = Effect.gen(function* () { const { read: original } = yield* Source; const read = original; return Effect.fn("Source.read")(read); });',
    valid:
      'import { Source } from "./service"; import { Effect } from "effect"; export const x = Effect.gen(function* () { const source = yield* Source; return Effect.fn("Source.dispatch")((id) => source[choose(id)](id)); });',
  },
  {
    plugin: "effect",
    rule: "require-service-operation-instrumentation",
    invalid:
      'import { Source } from "./service"; import { Effect } from "effect"; const read = Effect.fn(() => Effect.void); export const x = { read } satisfies Source["Service"];',
    valid:
      'import { Source, SourceRead } from "./service"; import { Effect, Layer } from "effect"; export const x = Layer.effect(Source, Effect.gen(function* () { const { read } = yield* SourceRead; return { read } satisfies Source["Service"]; }));',
  },
  {
    plugin: "effect",
    rule: "require-service-operation-instrumentation",
    invalid:
      'import type { Source } from "./service"; import { Effect } from "effect"; type Contract = Source["Service"]; export const x = { read: () => Effect.void } satisfies Contract;',
    valid:
      'import type { Source } from "./service"; import { Effect } from "effect"; type Contract = Source["Service"]; export const x = { read: Effect.fn("Source.read")(() => Effect.void) } satisfies Contract;',
  },
  {
    plugin: "effect",
    rule: "require-service-operation-instrumentation",
    invalid:
      'import { Source } from "./service"; import { Effect, Layer } from "effect"; export const x = Layer.effect(Source, Effect.gen(function* () { return { read: () => Effect.void } satisfies Record<string, Function>; }));',
    valid:
      'import { Source } from "./service"; import { Effect, Layer } from "effect"; export const x = Layer.effect(Source, Effect.gen(function* () { return { read: Effect.fn("Source.read")(() => Effect.void) } satisfies Record<string, Function>; }));',
  },
  {
    plugin: "effect",
    rule: "require-service-operation-instrumentation",
    invalid:
      'import { Source } from "./service"; import { Effect } from "effect"; const read = Effect.gen(function* () { return { get: () => Effect.void }; }); export const x = Effect.gen(function* () { const operations = yield* read.pipe(Effect.provideService(Dependency, value)); return Source.of({ ...operations }); });',
    valid:
      'import { Source } from "./service"; import { Effect } from "effect"; const read = Effect.gen(function* () { return { get: Effect.fn("Reader.get")(() => Effect.void) }; }); export const x = Effect.gen(function* () { const operations = yield* read.pipe(Effect.provideService(Dependency, value)); return Source.of({ ...operations }); });',
  },
  {
    plugin: "effect",
    rule: "require-service-operation-instrumentation",
    file: "packages/content/src/live.layer.ts",
    options: {
      operationAdapters: [
        { file: "packages/content/src/operation.ts", exports: ["read"], operation: "Content.read" },
      ],
    },
    invalid:
      'import { Content } from "./service"; import { read } from "./neighbour/operation"; export const x = { read: input => read(storage, input) } satisfies Content["Service"];',
    valid:
      'import { Content } from "./service"; import { read } from "./operation"; export const x = { read: input => read(storage, input) } satisfies Content["Service"];',
  },
  {
    plugin: "effect",
    rule: "no-redundant-operation-wrappers",
    invalid:
      'import { Effect } from "effect"; const read = Effect.fn("Read.get")(() => Effect.void); export const x = Effect.fn("Read.get")(read);',
    valid:
      'import { Effect } from "effect"; const read = Effect.fnUntraced(function* () { return yield* Effect.void; }); export const x = Effect.fn("Read.get")(read);',
  },
  {
    plugin: "effect",
    rule: "no-redundant-operation-wrappers",
    invalid:
      'import { Source } from "./service"; import { Effect } from "effect"; export const x = Effect.gen(function* () { const source = yield* Source; return Effect.fn("Source.read")((id) => source.read(id)); });',
    valid:
      'import { Source } from "./service"; import { Effect } from "effect"; export const x = Effect.gen(function* () { const source = yield* Source; return source.read; });',
  },
  {
    plugin: "effect",
    rule: "no-redundant-operation-wrappers",
    invalid:
      'import { Source } from "./service"; import * as E from "effect/Effect"; export const x = E.gen(function* () { const source = yield* Source; return E.fn("Source.read")(function* (id) { return yield* source.read(id); }); });',
    valid:
      'import { Source } from "./service"; import * as E from "effect/Effect"; export const x = E.gen(function* () { const source = yield* Source; return E.fn("Source.read")(function* (id) { const reply = yield* source.read(id); yield* audit(reply); return reply; }); });',
  },
  {
    plugin: "effect",
    rule: "no-redundant-operation-wrappers",
    invalid:
      'import { Source as S } from "./service"; import { Effect as E } from "effect"; export const x = E.gen(function* () { const original = yield* S; const alias = original; const read = alias.read; return E.fn("Source.read")(read); });',
    valid:
      'import { Source as S } from "./service"; import { Effect as E } from "effect"; export const x = E.gen(function* () { const source = yield* S; return E.fn("Source.read")((id) => source.read(id), E.timeout("1 second")); });',
  },
  {
    plugin: "effect",
    rule: "no-redundant-operation-wrappers",
    invalid:
      'import { Source } from "./service"; import { Effect } from "effect"; export const x = Effect.gen(function* () { const source = yield* Source; return Effect.fn("Source.read")((...args) => source.read(...args)); });',
    valid:
      'import { Source } from "./service"; import { Effect } from "effect"; export const x = Effect.gen(function* () { const source = yield* Source; return Effect.fn("Source.read")((id) => source.read({ id })); });',
  },
  {
    plugin: "effect",
    rule: "no-redundant-operation-wrappers",
    invalid:
      'import { Source } from "./service"; import { Effect } from "effect"; export const x = Effect.gen(function* () { const source = yield* Source; return source.read("one").pipe(Effect.withSpan("Source.read")); });',
    valid:
      'import { Source } from "./service"; import { Effect } from "effect"; export const x = Effect.gen(function* () { const source = yield* Source; return Effect.forEach(ids, source.read).pipe(Effect.withSpan("Source.batch")); });',
  },
  {
    plugin: "effect",
    rule: "no-redundant-operation-wrappers",
    invalid:
      'import { Effect } from "effect"; const read = Effect.fn("Read.get")(() => Effect.void); export const x = Effect.withSpan(read(), "Read.get");',
    valid:
      'import { Effect } from "effect"; const read = Effect.fn("Read.get")(() => Effect.void); export const x = (Effect: Client) => Effect.fn("Read.get")(read);',
  },
  {
    plugin: "effect",
    rule: "no-service-decorators",
    invalid:
      'import { Source } from "./service"; import { Layer, Effect } from "effect"; export const x = Layer.effect(Source, Effect.gen(function* () { const source = yield* Source; return Source.of({ ...source, search: Effect.fn("Source.search")(function* (text) { const result = yield* source.search(text); yield* capture(result); return result; }) }); }));',
    valid:
      'import { Source, Store, Analytics } from "./service"; import { Layer, Effect } from "effect"; export const x = Layer.effect(Source, Effect.gen(function* () { const store = yield* Store; const analytics = yield* Analytics; return Source.of({ search: Effect.fn("Source.search")(function* (text) { const result = yield* store.search(text); yield* analytics.capture(result); return result; }) }); }));',
  },
  {
    plugin: "effect",
    rule: "no-service-decorators",
    invalid:
      'import { Source as S } from "./service"; import { Layer as L, Effect as E } from "effect"; const Alias = S; export const x = L.effect(Alias, E.gen(function* () { const source = yield* S; return { ...source } satisfies S["Service"]; }));',
    valid:
      'import { Source as S } from "./service"; import { Layer } from "effect"; export const x = Layer.effect(S, S);',
  },
  {
    plugin: "effect",
    rule: "no-service-decorators",
    invalid:
      'import { Source } from "./service"; import { Layer, Effect } from "effect"; export const x = Layer.effect(Source, Effect.map(Source, source => ({ ...source })));',
    valid:
      'import { Source as Left } from "./left"; import { Source as Right } from "./right"; import { Layer, Effect } from "effect"; export const x = Layer.effect(Left, Effect.gen(function* () { const source = yield* Right; return { ...source }; }));',
  },
  {
    plugin: "effect",
    rule: "no-service-decorators",
    invalid:
      'import { Context, Effect, Layer } from "effect"; class Source extends Context.Service<Source, {}>()("Source") {} const alias = Source; export const x = Layer.effect(Source, Effect.gen(function* () { const source = yield* alias; return { ...source }; }));',
    valid:
      'import { Source } from "./service"; import { Effect, Layer } from "effect"; export const x = (Source: Client) => Layer.effect(Source, Effect.gen(function* () { const source = yield* Source; return { ...source }; }));',
  },
  {
    plugin: "effect",
    rule: "require-service-operation-instrumentation",
    invalid:
      'import { Source } from "./service"; import { Effect, Layer } from "effect"; export const x = Layer.effect(Source, Effect.gen(function* () { return { read: () => Effect.void } satisfies Source["Service"]; }));',
    valid:
      'import { Source } from "./service"; import { Effect, Layer } from "effect"; export const x = Layer.effect(Source, Effect.gen(function* () { return { read: Effect.fn("Source.read")(() => Effect.void) } satisfies Source["Service"]; }));',
  },
  {
    plugin: "effect",
    rule: "require-service-operation-instrumentation",
    invalid:
      'import { Source } from "./service"; import { Effect, Layer } from "effect"; export const x = Layer.effect(Source, Effect.gen(function* () { return { read: () => Effect.void }; }));',
    valid:
      'import { Source, SourceRead } from "./service"; import { Effect, Layer } from "effect"; export const x = Layer.effect(Source, Effect.gen(function* () { const reads = yield* SourceRead; return { ...reads }; }));',
  },
  {
    plugin: "effect",
    rule: "require-service-operation-instrumentation",
    invalid:
      'import { Source } from "./service"; import { Effect, Layer } from "effect"; export const x = Layer.effect(Source, Effect.gen(function* () { if (condition) return { read: Effect.fn("Source.read")(() => Effect.void) }; return { read: () => Effect.void }; }));',
    valid:
      'import { Source } from "./service"; import { Effect, Layer } from "effect"; export const x = Layer.effect(Source, Effect.gen(function* () { if (condition) return { read: Effect.fn("Source.read")(() => Effect.void) }; return { read: Effect.fn("Source.read")(() => Effect.void) }; }));',
  },
  {
    plugin: "effect",
    rule: "require-service-operation-instrumentation",
    invalid:
      'import { Source } from "./service"; import { Effect } from "effect"; const methods = { read: () => Effect.void }; export const x = Source.of({ ...methods });',
    valid:
      'import { Source, SourceRead } from "./service"; import { Effect, Layer } from "effect"; export const x = Layer.effect(Source, Effect.gen(function* () { const reads = yield* SourceRead; return Source.of({ read: reads.read }); }));',
  },
  {
    plugin: "effect",
    rule: "require-service-operation-instrumentation",
    invalid:
      'import { Source } from "./service"; import { Effect, Layer } from "effect"; export const x = Layer.succeed(Source, { read: () => Effect.void });',
    valid:
      'import { Source, SourceRead } from "./service"; import { Effect, Layer } from "effect"; export const x = Layer.effect(Source, Effect.gen(function* () { const reads = yield* SourceRead; const alias = reads; return { read: alias.read } satisfies Source["Service"]; }));',
  },
];
