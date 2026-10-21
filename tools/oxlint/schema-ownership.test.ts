import { assert, it } from "@effect/vitest";
import { Array, Cache, Effect, Equal, Hash, Ref, Result, Schema } from "effect";

const Start = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)).pipe(Schema.brand("ExampleStart"));
const End = Schema.Int.check(Schema.isGreaterThan(0)).pipe(Schema.brand("ExampleEnd"));
const Text = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(3000)).pipe(
  Schema.brand("ExampleText"),
);
const Fields = Schema.Struct({ start: Start, end: End, text: Text });
const Bounds = Schema.makeFilter<typeof Fields.Type>(
  (row) => row.end === row.start + row.text.length || "end must follow the complete text",
);
const Row = Fields.check(Bounds);
const RowId = Schema.Trimmed.check(Schema.isMinLength(1)).pipe(Schema.brand("ExampleRowId"));
const ProviderRow = Schema.Struct({ ...Fields.fields, id: RowId }).check(Bounds);
class InvalidRowError extends Schema.TaggedError<
  InvalidRowError,
  { readonly brand: unique symbol }
>()("InvalidRowError", {}) {}

it.effect("qualifies constructor errors and shared record checks with the installed Effect", () =>
  Effect.gen(function* () {
    const text = yield* Text.makeEffect("example");
    const start = yield* Start.makeEffect(0);
    const end = yield* End.makeEffect(text.length);
    const checked = yield* Row.makeEffect({ start, end, text });
    assert.deepEqual(checked, { start, end, text });
    const failed = yield* Start.makeEffect(-1).pipe(
      Effect.mapError(() => new InvalidRowError()),
      Effect.result,
    );
    assert.isTrue(Result.isFailure(failed));
    if (Result.isFailure(failed)) assert.isTrue(Schema.is(InvalidRowError)(failed.failure));
    const badWire = { id: "example", start: 0, end: 1, text: "example" };
    assert.isTrue(
      Result.isFailure(yield* Schema.decodeEffect(ProviderRow)(badWire).pipe(Effect.result)),
    );
    assert.isTrue(
      Result.isSuccess(
        yield* Schema.decodeEffect(ProviderRow)({ ...badWire, end: 7 }).pipe(Effect.result),
      ),
    );
  }),
);

const DocumentId = Schema.Trimmed.check(Schema.isMinLength(1)).pipe(
  Schema.brand("ExampleDocumentId"),
);
const Revision = Schema.Trimmed.check(Schema.isMinLength(1)).pipe(Schema.brand("ExampleRevision"));
const Digest = Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/u)).pipe(
  Schema.brand("ExampleDigest"),
);
const Copy = Schema.Struct({ id: DocumentId, revision: Revision });
const Key = Schema.Struct({ copy: Copy, preparationHash: Digest });

it.effect("qualifies readonly structural cache keys and complete address identity", () =>
  Effect.gen(function* () {
    const id = yield* DocumentId.makeEffect("example");
    const revision = yield* Revision.makeEffect("v1");
    const preparationHash = yield* Digest.makeEffect("0".repeat(64));
    const key: typeof Key.Type = { copy: { id, revision }, preparationHash };
    const equivalent: typeof Key.Type = { preparationHash, copy: { revision, id } };
    assert.isTrue(Equal.equals(key, equivalent));
    assert.strictEqual(Hash.hash(key), Hash.hash(equivalent));
    const lookups = yield* Ref.make(0);
    const cache = yield* Cache.make({
      capacity: 8,
      timeToLive: "10 minutes",
      lookup: (_key: typeof Key.Type) => Ref.updateAndGet(lookups, (count) => count + 1),
    });
    assert.deepEqual(
      yield* Effect.all([Cache.get(cache, key), Cache.get(cache, equivalent)], { concurrency: 2 }),
      [1, 1],
    );
    const otherId = yield* DocumentId.makeEffect("other");
    const otherRevision = yield* Revision.makeEffect("v2");
    const otherHash = yield* Digest.makeEffect("1".repeat(64));
    const different: ReadonlyArray<typeof Key.Type> = [
      { ...key, copy: { ...key.copy, id: otherId } },
      { ...key, copy: { ...key.copy, revision: otherRevision } },
      { ...key, preparationHash: otherHash },
    ];
    assert.deepEqual(
      yield* Effect.forEach(different, (value) => Cache.get(cache, value), { concurrency: 1 }),
      [2, 3, 4],
    );
    assert.isTrue(Array.every(different, (value) => !Equal.equals(value, key)));
    assert.strictEqual(yield* Ref.get(lookups), 4);
  }),
);
