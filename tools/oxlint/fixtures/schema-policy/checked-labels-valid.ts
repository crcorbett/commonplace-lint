import type { OrderTopic } from "@example/orders/schemas";

export const topicLabels = {
  delivery: "Delivery",
  returns: "Returns",
  "not-sure": "Not sure yet",
} as const satisfies Readonly<Record<OrderTopic, string>>;
