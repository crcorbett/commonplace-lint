import * as Schema from "effect/Schema";
import * as SchemaTransformation from "effect/SchemaTransformation";
import * as SchemaGetter from "effect/SchemaGetter";
import { Schema as RootSchema } from "effect";
import { decodeTo as Decode } from "effect/Schema";

const { encodeTo: Encode } = Schema;
const Transform = SchemaTransformation.transform;
const helper = Schema.String.pipe(Decode(Schema.String, SchemaTransformation.toLowerCase()));
export const RecordId = Schema.Trim;
export const RecordPageId = Schema.String.pipe(
  Schema.decodeTo(Schema.String, SchemaTransformation.trim()),
);
export const encoding = () => {
  const RecordTableId = Schema.String.pipe(
    Encode(Schema.String, SchemaTransformation.toUpperCase()),
  );
  return RecordTableId;
};
export const custom = () => {
  const RecordSourceId = Schema.String.pipe(
    Decode(
      Schema.String,
      Transform({ decode: (text) => text.replaceAll("-", ""), encode: (text) => text }),
    ),
  );
  return RecordSourceId;
};
export const alias = () => {
  const RecordPageId = helper;
  return RecordPageId;
};
export const root = () => {
  const RecordId = RootSchema.Trim;
  return RecordId;
};
const makeCodec = () => Schema.String.pipe(Decode(Schema.String, SchemaTransformation.trim()));
export const factory = () => {
  const RecordId = makeCodec();
  return RecordId;
};
const cycleA = cycleB;
const cycleB = cycleA;
export const cycle = () => {
  const RecordId = cycleA;
  return RecordId;
};
export const sameTypeDecode = () => {
  const RecordId = Schema.String.pipe(
    Schema.decode({
      decode: SchemaGetter.transform((text) => text.trim()),
      encode: SchemaGetter.passthrough(),
    }),
  );
  return RecordId;
};
export const sameTypeEncode = () => {
  const RecordId = Schema.String.pipe(
    Schema.encode({
      decode: SchemaGetter.passthrough(),
      encode: SchemaGetter.transform((text) => text.toLowerCase()),
    }),
  );
  return RecordId;
};
