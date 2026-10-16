import * as Schema from "effect/Schema";
import { ColumnKind as Kind } from "@example/orders/columns";
import * as Columns from "@example/orders/columns";

const Alias = Kind;
const { ColumnKind: Destructured } = Columns;
const { Struct: MakeStruct } = Schema;
export const alias = () => {
  const ColumnKind = Kind;
  const ManagedColumn = Schema.Struct({ type: Alias });
  return { ColumnKind, ManagedColumn };
};
export const namespace = () => {
  const ManagedColumn = Schema.Struct({ type: Columns.ColumnKind });
  return ManagedColumn;
};
export const destructured = () => {
  const ManagedColumn = MakeStruct({ type: Destructured });
  return ManagedColumn;
};
export const optional = () => {
  const ManagedColumn = Schema.Struct({ type: Schema.optionalKey(Kind) });
  return ManagedColumn;
};
