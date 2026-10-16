import type { ColumnKind } from "@example/orders/columns";
import type { SelectColor, StatusGroup, StatusOptionRequest } from "@example/store/columns";

type InitialStatusOption = Readonly<
  Omit<StatusOptionRequest, "color" | "group"> & { color: SelectColor; group: StatusGroup }
>;
export const orderColumns = { name: { name: "Name", type: "title" } } as const satisfies Readonly<
  Record<string, { readonly name: string; readonly type: typeof ColumnKind.Type }>
>;
export const statusOptions = [
  { name: "New", color: "blue", group: "To-do" },
] as const satisfies readonly InitialStatusOption[];
export const unrelatedMap = { anything: "allowed" };
