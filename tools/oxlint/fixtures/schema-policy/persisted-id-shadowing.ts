import * as Schema from "effect/Schema";

export const realString = Schema.String;
export const shadowed = (Schema: Readonly<{ Trim: typeof realString }>) => {
  const RecordId = Schema.Trim;
  return RecordId;
};
