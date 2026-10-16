import * as Schema from "effect/Schema";

// Validation and branding keep the saved text, including compact and hyphenated forms.
export const ids = () => {
  const RecordId = Schema.String.check(
    Schema.isPattern(/^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/u),
  );
  const RecordPageId = RecordId.pipe(Schema.brand("RecordPageId"));
  const RecordTableId = RecordId.pipe(Schema.brand("RecordTableId"));
  const RecordSourceId = RecordId.pipe(Schema.brand("RecordSourceId"));
  return { RecordPageId, RecordTableId, RecordSourceId };
};
export const unrelated = Schema.Trim;
export const validation = () => {
  const RecordId = Schema.String.check(Schema.makeFilter((value) => value === value.toLowerCase()));
  return RecordId;
};
