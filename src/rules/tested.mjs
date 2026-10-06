// Level 2, "tested": at least three task evals a machine can check, and a trigger set
// with both should-load requests and near-misses that should not load the skill.
import { defineRules } from "./define.mjs";
import { readEvals, readTriggers } from "../evals.mjs";
import { readGoldens, goldenOpts } from "../goldens.mjs";

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
      const goldenCases = readGoldens(ctx.dir, goldenOpts(ctx)).filter((g) => g.input !== null && g.output !== null).length;
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
    // MEASURED 2026-10-05 (freedom-dev): `superskill init` writes one example eval and two example
    // triggers, each starting "REPLACE:", and a skill whose author copied those up to 3 and 10
    // scored `tested` while testing nothing. A placeholder, or the same request twice, is not a case.
    id: "evals-real",
    level: "tested",
    check(ctx) {
      if (ctx.error) return [];
      const e = readEvals(ctx.dir), t = readTriggers(ctx.dir);
      const out = [];
      const placeholder = (x) => /\bREPLACE:/.test(JSON.stringify(x));
      const evalHits = e.cases.filter((c) => placeholder([c.prompt, c.expected_output, c.assertions])).map((c) => c.id);
      if (evalHits.length) out.push(f("fail", `eval case${evalHits.length === 1 ? "" : "s"} ${evalHits.join(", ")} still hold${evalHits.length === 1 ? "s" : ""} a \`superskill init\` REPLACE: placeholder`, "Replace every example with a real request this skill handles and what a good answer must contain."));
      const trigHits = t.triggers.filter((x) => placeholder(x.query)).length;
      if (trigHits) out.push(f("fail", `${trigHits} trigger${trigHits === 1 ? "" : "s"} still hold a REPLACE: placeholder`, "Replace them with realistic requests, including near-misses that should not load the skill."));
      const dup = (list) => list.filter((x, i) => x && list.indexOf(x) !== i);
      const dp = [...new Set(dup(e.cases.map((c) => c.prompt.trim())))];
      if (dp.length) out.push(f("fail", `${dp.length} eval prompt${dp.length === 1 ? " is" : "s are"} repeated: the same request twice is one case`, "Make each case a different request."));
      const dq = [...new Set(dup(t.triggers.map((x) => x.query.trim().toLowerCase())))];
      if (dq.length) out.push(f("fail", `${dq.length} trigger quer${dq.length === 1 ? "y is" : "ies are"} repeated`, "Make each trigger a different request."));
      return out;
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
