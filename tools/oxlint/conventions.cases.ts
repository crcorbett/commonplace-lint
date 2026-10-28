import type * as Schema from "effect/Schema";

export interface Case {
  readonly rule: string;
  readonly invalid: string;
  readonly valid: string;
  readonly plugin?: string;
  readonly namespace?: string;
  readonly file?: string;
  readonly options?: Schema.Json;
}

export const conventionCases: readonly Case[] = [
  {
    rule: "object-operation-input",
    file: "apps/site/src/actors/store-state.ts",
    invalid: "export const update = (state: State, value: Value) => state;",
    valid: "export const update = ({ state, value }: Input) => state;",
  },
  {
    rule: "scoped-managed-runtime",
    options: { hostLifetimes: [{ file: "input.ts", declaration: "runtime" }] },
    invalid:
      'import { ManagedRuntime as M } from "effect"; const runtime = M.make(layer); export const second = M.make(layer);',
    valid: 'import { ManagedRuntime as M } from "effect"; export const runtime = M.make(layer);',
  },
  {
    rule: "scoped-managed-runtime",
    options: { hostLifetimes: [{ file: "input.ts", declaration: "runtime" }] },
    invalid:
      'import { ManagedRuntime as M } from "effect"; export const create = () => { const runtime = M.make(layer); return runtime; };',
    valid: 'import { ManagedRuntime as M } from "effect"; export const runtime = M.make(layer);',
  },
  {
    rule: "no-cross-package-source-imports",
    plugin: "package",
    file: "apps/site/src/index.ts",
    invalid: 'export { value } from "../../../packages/example";',
    valid: 'export { value } from "@example/package";',
  },
  {
    rule: "no-conditional-object-spread",
    invalid: "export const x = { ...(ready && { a: 1 }) };",
    valid: "export const x = { a: 1 };",
  },
  {
    rule: "no-in-operator",
    invalid: 'export const x = "id" in value;',
    valid: 'export const x = Record.get(value, "id");',
  },
  {
    rule: "no-nullish-comparison",
    invalid: "export const x = value !== undefined;",
    valid: "export const x = Option.isSome(value);",
  },
  {
    rule: "no-nullish-comparison",
    invalid: "export const x = value == null;",
    valid: "export const x = Option.isNone(value);",
  },
  {
    rule: "no-native-collections",
    invalid: "export const x = new Map();",
    valid: "export const x = HashMap.empty();",
  },
  {
    rule: "curried-collections",
    invalid: 'import { Array as A } from "effect"; export const x = A.map(values, f);',
    valid: 'import { Array as A } from "effect"; export const x = A.map(f)(values);',
  },
  {
    rule: "curried-collections",
    invalid: 'import { map as project } from "effect/Array"; export const x = project(values, f);',
    valid: 'import { Array as A } from "effect"; export const x = (A: Client) => A.map(values, f);',
  },
  {
    rule: "curried-collections",
    invalid: 'import { Array as A } from "effect"; export const x = A.reduce(values, 0, f);',
    valid: 'import { Array as A } from "effect"; export const x = A.reduce(0, f)(values);',
  },
  {
    rule: "curried-collections",
    invalid: 'import { reduce as fold } from "effect/Array"; export const x = fold(values, 0, f);',
    valid: 'import { reduce as fold } from "effect/Array"; export const x = fold(0, f)(values);',
  },
  {
    rule: "no-wrapper-composition",
    invalid: "export const x = outer(inner(value));",
    valid: "export const x = value.pipe(inner, outer);",
  },
  {
    rule: "no-wrapper-composition",
    invalid: 'import { Effect } from "effect"; export const x = Effect.map(toResult);',
    valid: 'import { Effect } from "effect"; export const x = Effect.map((value) => ({ value }));',
  },
  {
    rule: "no-nullable-boundary-leak",
    invalid: 'import { Option as O } from "effect"; export const x = O.getOrNull(value);',
    valid:
      'import { Option as O } from "effect"; export const x = O.getOrElse(() => fallback)(value);',
  },
  {
    rule: "no-primitive-failure",
    invalid: 'import { Effect as E } from "effect"; export const x = E.fail("bad");',
    valid: 'import { Effect as E } from "effect"; export const x = E.fail(new Failure({}));',
  },
  {
    rule: "no-primitive-failure",
    invalid: 'import { mapError } from "effect/Effect"; export const x = mapError(() => "bad");',
    valid:
      'import { mapError } from "effect/Effect"; export const x = mapError(() => new Failure({}));',
  },
  {
    rule: "require-try-promise-catch",
    invalid: 'import { Effect as E } from "effect"; export const x = E.tryPromise(() => sdk());',
    valid:
      'import { Effect as E } from "effect"; export const x = E.tryPromise({ try: () => sdk(), catch: () => new Failure({}) });',
  },
  {
    rule: "no-defecting-layer",
    invalid: 'import { Layer as L } from "effect"; export const x = L.orDie(layer);',
    valid:
      'import { Layer as L } from "effect"; export const x = L.catchTag("Failure", recover)(layer);',
  },
  {
    rule: "named-effect-operations",
    invalid: 'import { Effect } from "effect"; export const x = () => Effect.gen(function* () {});',
    valid:
      'import { Effect } from "effect"; export const x = Effect.fn("X.read")(function* () {});',
  },
  {
    rule: "object-operation-input",
    invalid:
      'import { Effect } from "effect"; export const x = Effect.fn("X.read")((id: string) => Effect.void);',
    valid:
      'import { Effect } from "effect"; export const x = Effect.fn("X.read")(({ id }: Request) => Effect.void);',
  },
  {
    rule: "branded-identifier-schema",
    invalid:
      'import { Schema as S } from "effect"; const Raw = S.String.check(S.isNonEmpty()); export const x = S.Struct({ id: Raw });',
    valid:
      'import { Schema as S } from "effect"; const Id = S.String.pipe(S.brand("Id")); export const x = S.Struct({ id: Id });',
  },
  {
    rule: "no-raw-semantic-identifier",
    invalid: "export interface Request { readonly id: string; }",
    valid: "export interface Request { readonly id: RecordId; }",
  },
  {
    rule: "no-generic-client-escape",
    invalid: "export interface Client { readonly useClient: <T>(f: (raw: Raw) => T) => T; }",
    valid: "export interface Client { readonly readRecord: (input: Input) => Result; }",
  },
  {
    rule: "no-unknown-service-contract",
    invalid:
      'import type { Effect } from "effect"; export interface Client { readonly read: (input: unknown) => Effect.Effect<void, unknown>; }',
    valid:
      'import type { Effect } from "effect"; export interface Client { readonly read: (input: Input) => Effect.Effect<void, Failure>; }',
  },
  {
    rule: "no-unknown-tagged-error-payload",
    invalid:
      'import { Schema as S } from "effect"; export class Bad extends S.TaggedError<Bad>()("Bad", { cause: S.Unknown }) {}',
    valid:
      'import { Schema as S } from "effect"; export class Bad extends S.TaggedError<Bad>()("Bad", { reason: S.String }) {}',
  },
  {
    rule: "no-host-api-in-contract",
    file: "packages/example/src/service.ts",
    invalid: 'import { Worker } from "alchemy/Cloudflare"; export { Worker };',
    valid:
      'import type { Effect } from "effect"; export interface Client { readonly read: Effect.Effect<void>; }',
  },
  {
    rule: "no-host-api-in-contract",
    file: "packages/example/src/service.ts",
    invalid: 'import { Worker } from "@alchemy.run/cloudflare"; export { Worker };',
    valid:
      'import type { Effect } from "effect"; export interface Client { readonly read: Effect.Effect<void>; }',
  },
  {
    rule: "no-layer-export-in-service",
    file: "packages/example/src/service.ts",
    invalid: "export const ClientLive = layer;",
    valid: "export const Client = contract;",
  },
  {
    rule: "no-defecting-web-crypto",
    invalid:
      'import { Effect } from "effect"; export const x = Effect.promise(() => crypto.subtle.digest("SHA-256", input));',
    valid:
      'import { Effect } from "effect"; export const x = Effect.tryPromise({ try: () => crypto.subtle.digest("SHA-256", input), catch: () => new Failure({}) });',
  },
  {
    rule: "no-mixed-test-globals",
    invalid: 'import { it } from "@effect/vitest"; import { describe } from "vitest";',
    valid: 'import { it as effectIt } from "@effect/vitest"; import { describe } from "vitest";',
  },
  {
    rule: "no-schema-decoder-outside-ingress",
    invalid:
      'import { decodeUnknownEffect as decode } from "effect/Schema"; const inspect = decode; export const x = inspect(Input)(raw);',
    valid:
      'import { Schema as S } from "effect"; export const x = (S: Client) => S.decodeUnknownEffect(Input)(raw);',
  },
  {
    rule: "no-schema-encoder-outside-egress",
    invalid:
      'import * as S from "effect/Schema"; const { encodeEffect: encode } = S; export const x = encode(Output)(value);',
    valid:
      'import * as S from "effect/Schema"; export const x = S.String.pipe(S.encodeTo(Output));',
  },
  {
    rule: "no-sync-decoder-outside-consumer",
    invalid:
      'import { Schema as S } from "effect"; export const x = S.decodeUnknownOption(Input)(raw);',
    valid:
      'import { Schema as S } from "effect"; export const x = S.decodeUnknownEffect(Input)(raw);',
  },
  {
    rule: "no-throwing-schema-codec",
    invalid:
      'import { Schema as S } from "effect"; export const x = S.decodeUnknownSync(Input)(raw);',
    valid:
      'import { Schema as S } from "effect"; export const x = S.decodeUnknownOption(Input)(raw);',
  },
  {
    rule: "scoped-managed-runtime",
    invalid:
      'import { Effect, ManagedRuntime as M } from "effect"; export const x = M.make(layer);',
    valid:
      'import { Effect, ManagedRuntime as M } from "effect"; export const x = Effect.acquireRelease(Effect.sync(() => M.make(layer)), (runtime) => runtime.disposeEffect);',
  },
  {
    rule: "scoped-managed-runtime",
    invalid:
      'import { Effect, ManagedRuntime as M } from "effect"; export const x = Effect.acquireRelease(Effect.sync(() => M.make(layer)), (runtime) => other.disposeEffect);',
    valid:
      'import { Effect, ManagedRuntime as M } from "effect"; export const x = (M: Client) => M.make(layer);',
  },
  {
    rule: "scoped-web-handler",
    invalid:
      'import { HttpRouter as R } from "effect/http"; export const x = R.toWebHandler(layer);',
    valid:
      'import { Effect } from "effect"; import { HttpRouter as R } from "effect/http"; export const x = Effect.acquireRelease(Effect.sync(() => R.toWebHandler(layer)), ({ dispose }) => Effect.promise(dispose));',
  },
  {
    rule: "no-live-alchemy-lifecycle",
    invalid: 'import { Plan } from "alchemy"; export const x = Plan.make(stack);',
    valid: 'import { Plan } from "alchemy"; export const x = (Plan: Client) => Plan.make(stack);',
  },
  {
    rule: "no-node-runtime",
    invalid:
      'import * as NodeRuntime from "@effect/platform-node/NodeRuntime"; export { NodeRuntime };',
    valid: 'import * as BunRuntime from "@effect/platform-bun/BunRuntime"; export { BunRuntime };',
  },
  {
    rule: "effect-script-entry",
    file: "scripts/check.ts",
    invalid:
      'import { Effect } from "effect"; import * as Runtime from "@effect/platform-bun/BunRuntime"; export const x = Effect.void;',
    valid:
      'import { Effect } from "effect"; import * as Runtime from "@effect/platform-bun/BunRuntime"; Runtime.runMain(Effect.void);',
  },
  {
    rule: "browser-runtime-ownership",
    options: { runtimeOwners: ["owner.ts"], registryOwners: ["root.tsx"] },
    invalid: 'import { Atom as A } from "@effect/atom-react"; export const x = A.runtime(layer);',
    valid:
      'import { Atom as A } from "@effect/atom-react"; export const x = (A: Client) => A.runtime(layer);',
  },
  {
    rule: "native-http-client-ownership",
    options: { browserOwners: ["browser.ts"], serverOwners: ["server.ts"] },
    invalid: 'import { HttpApiClient as C } from "effect/http-api"; export const x = C.make(Api);',
    valid:
      'import { HttpApiClient as C } from "effect/http-api"; export const x = (C: Client) => C.make(Api);',
  },
  {
    rule: "bounded-build-memo",
    options: { targets: [{ file: "input.ts", declaration: "props" }] },
    invalid: 'export const props = { memo: { include: ["../../**/*"], lockfile: true } };',
    valid:
      'export const props = { memo: { include: ["src/**/*.ts", "../../packages/example/src/**/*.ts"], lockfile: true } };',
  },
  {
    rule: "no-context-nullish-default",
    plugin: "web",
    invalid: 'export const x = input.title ?? "Fallback";',
    valid: "export const x = input.title;",
  },
  {
    rule: "no-page-wrapper",
    plugin: "web",
    file: "apps/site/src/routes/index.tsx",
    invalid: "export const x = { component: MarketingPage };",
    valid: "export const x = { component: MarketingRoute };",
  },
  {
    rule: "no-route-local-seo",
    plugin: "web",
    invalid: "export const x = seo({ title: value });",
    valid: "export const x = routeSeo(page);",
  },
  {
    rule: "no-route-local-markdown-negotiation",
    plugin: "web",
    invalid:
      'import { negotiate } from "$/lib/seo-aeo/markdown-negotiation"; export { negotiate };',
    valid: 'import { routeSeo } from "./metadata"; export { routeSeo };',
  },
  {
    rule: "no-unscoped-server-functions",
    plugin: "web",
    invalid: 'import { createServerFn } from "@tanstack/react-start"; export { createServerFn };',
    valid:
      'import { createIsomorphicFn } from "@tanstack/react-start"; export { createIsomorphicFn };',
  },
  {
    rule: "no-route-json-ld",
    plugin: "web",
    file: "apps/site/src/routes/index.tsx",
    invalid: 'export const x = { type: "application/ld+json" };',
    valid: "export const x = routeSeo(page);",
  },
  {
    rule: "no-module-owned-public-asset-url",
    plugin: "web",
    file: "component.tsx",
    invalid: 'export const x = <img src="/images/logo.png" />;',
    valid: "export const x = <img src={logo} />;",
  },
  {
    rule: "no-http-globals-in-seo",
    plugin: "web",
    file: "packages/aeo/src/reply.ts",
    invalid: "export const x = new Response(body);",
    valid: "export const x = HttpServerResponse.text(body);",
  },
  {
    rule: "no-local-mdx-registry",
    plugin: "web",
    file: "component.tsx",
    invalid: "export const mdxComponents = { p: Paragraph };",
    valid: 'import { shared } from "./registry"; export const x = <MDX components={shared} />;',
  },
  {
    rule: "semantic-typography",
    plugin: "web",
    file: "component.tsx",
    invalid: 'export const x = <p className="hover:!text-xl/6 font-bold">Text</p>;',
    valid: 'export const x = <p className="type-body">Text</p>;',
  },
  {
    rule: "gap-layout",
    plugin: "web",
    file: "component.tsx",
    invalid: 'export const x = <div className="md:space-x-4" />;',
    valid: 'export const x = <div className="flex gap-4" />;',
  },
  {
    rule: "safe-type-line-height",
    plugin: "web",
    invalid: 'export const x = "--text-body--line-height: calc(2 / 3);";',
    valid: 'export const x = "--text-body--line-height: var(--leading-normal);";',
  },
];
