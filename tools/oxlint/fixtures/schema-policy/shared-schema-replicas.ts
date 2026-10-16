import * as Schema from "effect/Schema";
import { ContactEmail as SharedEmail } from "@example/orders/schemas";
export const ColumnKind = Schema.Literals(["title", "select"]);
export type OrderTopic = "delivery" | "returns";
export interface Order {
  readonly email: string;
}
export let ContactEmail = SharedEmail;
