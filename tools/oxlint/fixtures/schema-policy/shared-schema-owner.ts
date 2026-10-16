import * as Schema from "effect/Schema";

// The owner declares the shared schemas, their public type aliases and the
// configured fields that reuse them.
export const ContactEmail = Schema.String.check(Schema.isPattern(/^[^@\s]+@[^@\s]+$/u)).pipe(
  Schema.brand("ContactEmail"),
);
export type ContactEmail = typeof ContactEmail.Type;
export const OrderTopic = Schema.Literals(["delivery", "returns"]);
export type OrderTopic = typeof OrderTopic.Type;
export const Order = Schema.Struct({
  email: ContactEmail,
  topic: Schema.optionalKey(OrderTopic),
});
export type Order = typeof Order.Type;
