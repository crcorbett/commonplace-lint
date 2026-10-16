import * as Schema from "effect/Schema";
import * as Columns from "@example/orders/columns";
import { ColumnKind as WrongKind } from "another-package";
export const ManagedColumn = Schema.Struct({ type: Schema.Literals(["title", "select"]) });
export const wrongImport = () => {
  const ManagedColumn = Schema.Struct({ type: WrongKind });
  return ManagedColumn;
};
export const missing = () => {
  const ManagedColumn = Schema.Struct({ name: Schema.String });
  return ManagedColumn;
};
export const shadowed = (Columns: Readonly<{ ColumnKind: typeof Schema.String }>) => {
  const ManagedColumn = Schema.Struct({ type: Columns.ColumnKind });
  return ManagedColumn;
};
export const shadowedSchema = (Schema: Readonly<{ Struct: (fields: unknown) => unknown }>) => {
  const ManagedColumn = Schema.Struct({ type: Columns.ColumnKind });
  return ManagedColumn;
};
export const dynamic = (key: string) => {
  const ManagedColumn = Schema.Struct({ type: Columns[key] });
  return ManagedColumn;
};
export const duplicate = () => {
  const ManagedColumn = Schema.Struct({ type: Columns.ColumnKind, type: Schema.String });
  return ManagedColumn;
};
export const spread = () => {
  const ManagedColumn = Schema.Struct({
    type: Columns.ColumnKind,
    ...{ type: Schema.String },
  });
  return ManagedColumn;
};
export const unknownKey = (key: string) => {
  const ManagedColumn = Schema.Struct({ type: Columns.ColumnKind, [key]: Schema.String });
  return ManagedColumn;
};
