// Level 2, "tested": at least three task evals a machine can check, and a trigger set
// with both should-load requests and near-misses that should not load the skill.
import { defineRules } from "./define.mjs";
import { readEvals, readTriggers } from "../evals.mjs";
import { readGoldens } from "../goldens.mjs";

const f = (severity, message, fix) => ({ severity, message, fix });
export const MIN_EVALS = 3, MIN_TRIGGERS = 10, MIN_EACH_SIDE = 3;

export const testedRules = defineRules([
  {
    id: "evals-present",
    level: "tested",
    check(ctx) {
      if (ctx.error) return [];
      const e = readEvals(ctx.dir);
      if (e.error) return [f("fail", e.error, "Fix evals/evals.json so it parses as skill-creator's {skill_name, evals: [...]}.")];
      const goldenCases = readGoldens(ctx.dir).filter((g) => g.input !== null && g.output !== null).length;
      const n = e.cases.length + goldenCases;
      if (n < MIN_EVALS)
        return [f("fail", `${n} eval case${n === 1 ? "" : "s"} (need ${MIN_EVALS})`, "Add real requests to evals/evals.json (`superskill init` writes an example).")];
      return [];
    },
  },
  {
    id: "evals-verifiable",
    level: "tested",
    check(ctx) {
      if (ctx.error) return [];
      const e = readEvals(ctx.dir);
      if (e.error || e.missing) return [];
      const bad = e.cases.filter((c) => !c.prompt.trim() || !c.assertions.length).map((c) => c.id);
      return bad.length
        ? [f("fail", `eval case${bad.length === 1 ? "" : "s"} ${bad.join(", ")} missing a prompt or any expectation`, "Give every case a prompt and at least one expectation (contains:, regex:, file_exists:, or a plain statement).")]
        : [];
    },
  },
  {
    id: "triggers-present",
    level: "tested",
    check(ctx) {
      if (ctx.error) return [];
      const t = readTriggers(ctx.dir);
      if (t.error) return [f("fail", t.error, "Write evals/triggers.json as [{\"query\": ..., \"should_trigger\": true|false}].")];
      const yes = t.triggers.filter((x) => x.should_trigger).length;
      const no = t.triggers.length - yes;
      if (t.triggers.length < MIN_TRIGGERS || yes < MIN_EACH_SIDE || no < MIN_EACH_SIDE)
        return [f("fail", `trigger set has ${yes} should-load and ${no} should-not (need ${MIN_TRIGGERS} total, at least ${MIN_EACH_SIDE} of each)`, "Add realistic requests to evals/triggers.json, including near-misses that share words with the skill but need something else.")];
      return [];
    },
  },
]);
