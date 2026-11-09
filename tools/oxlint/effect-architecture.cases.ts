import type { Case } from "./conventions.cases";

// Negative fixtures are adapted from strict-effect-ts review findings.
export const effectArchitectureCases: readonly Case[] = [
  {
    plugin: "strict-effect",
    rule: "no-layer-parameters-in-service-contracts",
    invalid:
      'import { Context } from "effect"; import type { Effect, Layer } from "effect"; export interface CalculationRequest<A, E, R> { readonly calculation: Effect.Effect<A, E, R>; readonly layer: Layer.Layer<R, E>; } export interface CalculationEngineService { readonly run: <A, E, R>(request: CalculationRequest<A, E, R>) => Effect.Effect<A, E>; } export class CalculationEngine extends Context.Service<CalculationEngine, CalculationEngineService>()("CalculationEngine") {}',
    valid:
      'import { Context } from "effect"; import type { Effect, Layer } from "effect"; export interface TakeHomeInput { readonly grossPay: number; } export type Composition = (layer: Layer.Layer<never>) => void; export class TakeHomePay extends Context.Service<TakeHomePay, { readonly calculate: (input: TakeHomeInput) => Effect.Effect<number>; readonly echo: <A>(value: A) => Effect.Effect<A> }>()("TakeHomePay") {}',
  },
  {
    plugin: "strict-effect",
    rule: "no-layer-parameters-in-service-contracts",
    invalid:
      'import * as Context from "effect/Context"; import type * as Effect from "effect/Effect"; export class Runner extends Context.Service<Runner, { run<A, E, R>(program: Effect.Effect<A, E, R>): Effect.Effect<A, E> }>()("Runner") {}',
    valid:
      'import * as Context from "effect/Context"; import type * as Effect from "effect/Effect"; export class Runner extends Context.Service<Runner, { run<A, E, R>(program: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> }>()("Runner") {}',
  },
  {
    plugin: "strict-effect",
    rule: "no-layer-parameters-in-service-contracts",
    invalid:
      'import { Context } from "effect"; import type * as Layer from "effect/Layer"; import type { Effect } from "effect"; type Contract = { readonly session: { readonly provide: (input: { readonly layer: Layer.Layer<never> }) => Effect.Effect<void> } }; export class Orders extends Context.Service<Orders, Contract>()("Orders") {}',
    valid:
      'import { Context } from "effect"; import type { Effect } from "effect"; type Layer = { readonly floor: number }; type Contract = { readonly session: { readonly provide: (input: { readonly layer: Layer }) => Effect.Effect<void> } }; export class Orders extends Context.Service<Orders, Contract>()("Orders") {}',
  },
  {
    plugin: "strict-effect",
    rule: "no-layer-construction-in-operations",
    invalid:
      'import { Context, Effect, Layer } from "effect"; import { program } from "./program"; class Scenario extends Context.Service<Scenario, { readonly grossPay: number }>()("Scenario") {} export const calculate = (input: { readonly grossPay: number }) => Effect.gen(function* () { return yield* program.pipe(Effect.provide(Layer.succeed(Scenario)(input))); });',
    valid:
      'import { Context, Effect, Layer } from "effect"; import { program, settings } from "./program"; class Scenario extends Context.Service<Scenario, { readonly grossPay: number }>()("Scenario") {} export const ScenarioLive = Layer.succeed(Scenario, { grossPay: 1 }); export const calculate = (input: { readonly grossPay: number }) => program.pipe(Effect.provideService(Scenario, input)); export const configured = Layer.unwrap(Effect.gen(function* () { const grossPay = yield* settings; return Layer.succeed(Scenario, { grossPay }); })); export const mapped = Layer.unwrap(Effect.map(settings, (grossPay) => Layer.succeed(Scenario, { grossPay })));',
  },
  {
    plugin: "strict-effect",
    rule: "no-layer-construction-in-operations",
    invalid:
      'import * as Effect from "effect/Effect"; import * as Layer from "effect/Layer"; import { Calculator, Content } from "./services"; export const handle = Effect.fn("Api.handle")(function* () { const calculator = Layer.succeed(Calculator, yield* Calculator); const content = Layer.effect(Content, Content.asEffect()); return [calculator, content]; });',
    valid:
      'import * as Effect from "effect/Effect"; import * as Layer from "effect/Layer"; import { Calculator, program } from "./services"; export const tested = program.pipe(Effect.provide(Layer.succeed(Calculator, { run: Effect.void }))); export const live = Layer.effect(Calculator, Effect.gen(function* () { yield* Effect.void; const local = Layer.succeed(Calculator, { run: Effect.void }); return { run: Effect.void, local }; }));',
  },
  {
    plugin: "strict-effect",
    rule: "exhaustive-closed-union-match",
    invalid:
      'import { Match, Schema } from "effect"; import { AnnualTaxReport, TakeHomePayReport, request, report } from "./reports"; export const answers = Match.value(request.calculatorId).pipe(Match.when("au.income-tax.annual", () => Schema.is(AnnualTaxReport)(report)), Match.when("au.pay.take-home", () => Schema.is(TakeHomePayReport)(report)), Match.orElse(() => false));',
    valid:
      'import { Match, Schema } from "effect"; import { AnnualTaxReport, TakeHomePayReport, request, report, term, error, Unavailable } from "./reports"; export const answers = Match.value(request.calculatorId).pipe(Match.when("au.income-tax.annual", () => Schema.is(AnnualTaxReport)(report)), Match.when("au.pay.take-home", () => Schema.is(TakeHomePayReport)(report)), Match.exhaustive); export const search = Match.value(term).pipe(Match.when("", () => 0), Match.orElse(() => 1)); export const failure = Match.value(error).pipe(Match.when(Schema.is(Unavailable), (value) => value), Match.when("timeout", () => 1), Match.orElse(() => 2));',
  },
  {
    plugin: "strict-effect",
    rule: "exhaustive-closed-union-match",
    invalid:
      'import * as Match from "effect/Match"; import { pipe } from "effect/Function"; import type { Event } from "./event"; import { event } from "./event"; export const tagged = Match.type<Event>().pipe(Match.tag("Created", "Updated", () => 1), Match.orElse(() => 0)); export const piped = pipe(Match.value(event), Match.when({ _tag: "Created" }, () => 1), Match.when({ _tag: "Deleted" }, () => 2), Match.orElse(() => 0));',
    valid:
      'import * as Match from "effect/Match"; import { pipe } from "effect/Function"; import { event, isArchived } from "./event"; export const piped = pipe(Match.value(event), Match.when({ _tag: "Created" }, () => 1), Match.when(isArchived, () => 2), Match.orElse(() => 0));',
  },
  {
    plugin: "strict-effect",
    rule: "no-redundant-schema-guard",
    invalid:
      'import { Match, Schema } from "effect"; import { AnnualReport, event } from "./reports"; export const total = Match.value(event).pipe(Match.tag("Annual", (report) => Schema.is(AnnualReport)(report)), Match.orElse(() => false));',
    valid:
      'import { Match, Schema } from "effect"; import { AnnualReport, event } from "./reports"; export const total = Match.value(event).pipe(Match.when(Schema.is(AnnualReport), (report) => report.total), Match.tag("Annual", (report) => Schema.is(AnnualReport)(report.attachment)), Match.orElse(() => 0));',
  },
  {
    plugin: "strict-effect",
    rule: "no-redundant-schema-guard",
    invalid:
      'import { Effect, Schema } from "effect"; import { Created, Event, Unavailable, program } from "./event"; export const read = (input: string) => Effect.gen(function* () { const event = yield* Schema.decodeUnknownEffect(Event)(input); return Schema.is(Created)(event); }); export const recovered = program.pipe(Effect.catchTag("Unavailable", (error) => Effect.succeed(Schema.is(Unavailable)(error))));',
    valid:
      'import { Effect, Schema } from "effect"; import { Created, TooLarge, program } from "./event"; export const read = (input: string) => Schema.is(Created)(input); export const recovered = program.pipe(Effect.catchTag("HttpClientError", (error) => Effect.succeed(Schema.is(TooLarge)(error.reason.cause))));',
  },
  {
    plugin: "strict-effect",
    rule: "no-generic-error-mapper",
    invalid:
      'import { Predicate, Schema } from "effect"; import { ApiDeadlineExceeded, ApiReplyTooLarge, ApiUnavailable } from "./errors"; export const transportFailure = <E>(error: E) => { if (Predicate.isTagged(error, "TimeoutError")) return new ApiDeadlineExceeded(); return Predicate.hasProperty(error, "reason") && Predicate.hasProperty(error.reason, "cause") && Schema.is(ApiReplyTooLarge)(error.reason.cause) ? new ApiReplyTooLarge() : new ApiUnavailable(); };',
    valid:
      'import { Effect, Predicate } from "effect"; import { ApiDeadlineExceeded, ApiUnavailable, program } from "./errors"; export const mapped = program.pipe(Effect.catchTags({ TimeoutError: () => Effect.fail(new ApiDeadlineExceeded()), HttpClientError: () => Effect.fail(new ApiUnavailable()) })); export const wrap = <A>(value: A) => [value]; export const host = (value: { readonly reason?: string }) => Predicate.hasProperty(value, "reason");',
  },
  {
    plugin: "strict-effect",
    rule: "no-generic-error-mapper",
    invalid:
      'import * as P from "effect/Predicate"; export function classify<Failure>(failure: Failure) { return P.isObject(failure) && "reason" in failure ? "reason" : P.isTagged("TimeoutError")(failure) ? "timeout" : "other"; }',
    valid:
      'import * as P from "effect/Predicate"; export function classify<Failure>(failure: Failure, raw: { readonly reason?: string }) { return "reason" in raw ? [failure] : P.isTagged(raw, "TimeoutError"); }',
  },
  {
    plugin: "strict-effect",
    rule: "no-config-error-fallback",
    invalid:
      'import { Effect } from "effect"; import { settings } from "./settings"; export const optionalSettings = settings.pipe(Effect.catchTags({ ConfigError: () => Effect.succeedNone, SchemaError: () => Effect.succeedNone }));',
    valid:
      'import { Effect } from "effect"; import { settings, page, StartupError } from "./settings"; export const required = settings.pipe(Effect.catchTags({ ConfigError: (error) => Effect.fail(new StartupError({ reason: error.message })) })); export const missing = page.pipe(Effect.catchTags({ SchemaError: () => Effect.succeedNone }));',
  },
  {
    plugin: "strict-effect",
    rule: "no-config-error-fallback",
    invalid:
      'import * as Effect from "effect/Effect"; import { HttpServerResponse } from "effect/http"; import { handler, routes } from "./routes"; const fallback = () => Effect.void; export const served = handler.pipe(Effect.catchTag("ConfigError", () => Effect.succeed(HttpServerResponse.empty({ status: 503 })))); export const mounted = Effect.catchTag(routes, ["ConfigError", "IllegalArgumentError"], fallback);',
    valid:
      'import * as Effect from "effect/Effect"; import { handler, Unavailable } from "./routes"; export const served = handler.pipe(Effect.catchTag("NotFound", () => Effect.succeedNone), Effect.catchTag("ConfigError", (error) => Effect.fail(new Unavailable({ cause: error }))));',
  },
  {
    rule: "no-decoded-nullish-default",
    invalid:
      "export const pages = (item: { readonly pages?: readonly string[] }) => [item, ...(item.pages ?? [])];",
    valid:
      'export const pages = (item: { readonly pages: readonly string[] }, headers: Headers, local?: readonly string[]) => [item, ...item.pages, ...(local ?? []), headers.get("content-type") ?? ""];',
  },
  {
    rule: "no-decoded-nullish-default",
    invalid:
      "export const keys = (decoded: Manifest, query?: Query) => [Object.keys(decoded.scripts ?? {}), query?.term ?? ``];",
    valid:
      'export const keys = (decoded: Manifest, query?: Query) => [Object.keys(decoded.scripts), query?.term ?? "all"];',
  },
];
