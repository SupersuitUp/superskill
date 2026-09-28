// Bonus lines for files other harnesses keep beside a skill. Never required, never a fail.
import { defineRules } from "./define.mjs";

export const interopRules = defineRules([
  {
    id: "workflow-map",
    level: "skill",
    check(ctx) {
      if (ctx.error || !ctx.files.includes("HDSOP.md")) return [];
      return [{ severity: "info", message: "workflow map (HDSOP.md) present", fix: "Nothing to do; this is a bonus." }];
    },
  },
]);
