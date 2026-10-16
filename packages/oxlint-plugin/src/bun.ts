import { defineRule } from "@oxlint/plugins";
import { Array, Option } from "effect";
import { propertyName } from "./syntax.js";

const ambientMethods = ["argv", "env", "file", "spawn", "spawnSync", "write"];

const noAmbientHostApi = defineRule({
  create(context) {
    return {
      MemberExpression(node) {
        if (
          node.object?.type === "Identifier" &&
          node.object.name === "Bun" &&
          Option.exists(propertyName(node.property), (name) => Array.contains(ambientMethods, name))
        ) {
          context.report({ messageId: "noAmbientHostApi", node });
        }
      },
    };
  },
  meta: {
    docs: { description: "Disallow direct Bun host APIs in Effect-owned TypeScript." },
    messages: {
      noAmbientHostApi:
        "Use decoded input and Effect platform services instead of direct Bun environment, file or process APIs.",
    },
    type: "problem",
  },
});

export default {
  meta: { name: "bun" },
  rules: {
    "no-ambient-host-api": noAmbientHostApi,
  },
};
