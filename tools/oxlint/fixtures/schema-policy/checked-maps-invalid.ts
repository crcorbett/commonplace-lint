import type { ColumnKind } from "@example/orders/columns";
import type { SelectColor, StatusGroup, StatusOptionRequest } from "@example/store/columns";

type InitialStatusOption = Readonly<
  Omit<StatusOptionRequest, "color" | "group"> & { color: SelectColor; group: StatusGroup }
>;
export const orderColumns: Readonly<
  Record<string, { readonly name: string; readonly type: typeof ColumnKind.Type }>
> = { name: { name: "Name", type: "title" } };
export const statusOptions = [
  { name: "New", color: "blue", group: "To-do" },
] as const satisfies readonly StatusOptionRequest[];
export const noConst = () => {
  const orderColumns = { name: { name: "Name", type: "title" } } satisfies Readonly<
    Record<string, { readonly name: string; readonly type: typeof ColumnKind.Type }>
  >;
  return orderColumns;
};
export const noCheck = () => {
  const statusOptions = [{ name: "New", color: "blue", group: "To-do" }] as const;
  return statusOptions;
};
export const weakCheck = () => {
  const orderColumns = { name: { name: "Name", type: "title" } } as const satisfies unknown;
  return orderColumns;
};
export const mutable = () => {
  let statusOptions = [
    { name: "New", color: "blue", group: "To-do" },
  ] as const satisfies readonly InitialStatusOption[];
  return statusOptions;
};
export const annotation = () => {
  const statusOptions: readonly InitialStatusOption[] = [
    { name: "New", color: "blue", group: "To-do" },
  ] as const satisfies readonly InitialStatusOption[];
  return statusOptions;
};
