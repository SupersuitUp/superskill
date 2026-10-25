// Bonus lines for files other harnesses keep beside a skill. Never required, never a fail.
import { defineRules } from "./define.mjs";
import { readText } from "../context.mjs";

// The five parts of an essence (SPEC, "The essence"), each matched by its heading.
const ESSENCE_PARTS = [
  ["the outcome", /^##\s+(the\s+)?outcome\b/im],
  ["the rigor worth inheriting", /^##\s+(the\s+)?rigor\b/im],
  ["what stays private", /^##\s+what\s+stays\s+private\b/im],
  ["the rebuild interview", /^##\s+(the\s+)?rebuild\s+interview\b/im],
  [`where it came from`, /^##\s+where\s+it\s+came\s+fr[o]m\b/im],
];

export const interopRules = defineRules([
  {
    id: "workflow-map",
    level: "skill",
    check(ctx) {
      if (ctx.error || !ctx.files.includes("HDSOP.md")) return [];
      return [{ severity: "info", message: "workflow map (HDSOP.md) present", fix: "Nothing to do; this is a bonus." }];
    },
  },
  {
    id: "essence-shape",
    level: "skill",
    check(ctx) {
      if (ctx.error || !ctx.files.includes("ESSENCE.md")) return [];
      const text = readText(ctx.dir, "ESSENCE.md") || "";
      const missing = ESSENCE_PARTS.filter(([, re]) => !re.test(text)).map(([name]) => name);
      if (!missing.length) return [{ severity: "info", message: "essence (ESSENCE.md) present with all five parts", fix: "Nothing to do; share ESSENCE.md, never SKILL.md." }];
      return [{ severity: "warn", file: "ESSENCE.md", message: `essence is missing: ${missing.join(", ")}`, fix: "Add a ## heading for each missing part (see SPEC, The essence)." }];
    },
  },
]);
