import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, rmSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { loadSkill } from "../src/context.mjs";
import { testedRules } from "../src/rules/tested.mjs";
import { superskillRules } from "../src/rules/superskill.mjs";
import { scoreSkill } from "../src/doctor.mjs";
import { skill, copySkill, NOW } from "./helpers.mjs";

const all = [...testedRules, ...superskillRules];
const rule = (id) => all.find((r) => r.id === id) || assert.fail(`no rule ${id}`);
const sev = (id, dir, now = NOW) => rule(id).check(loadSkill(dir), { now }).map((f) => f.severity).filter((s) => s !== "info");
const level = (dir, now = NOW) => scoreSkill(dir, { now }).level;
const setJson = (dir, rel, v) => writeFileSync(join(dir, rel), JSON.stringify(v, null, 2));

test("fixture levels: valid-basic skill, tested tested, superskill superskill, stale-yearly tested", () => {
  assert.equal(level(skill("valid-basic")), "skill");
  assert.equal(level(skill("tested")), "tested");
  assert.equal(level(skill("superskill")), "superskill");
  assert.equal(level(skill("stale-yearly")), "tested");
});

test("every tested and superskill rule is clean on the superskill fixture", () => {
  const ctx = loadSkill(skill("superskill"));
  for (const r of all) assert.deepEqual(r.check(ctx, { now: NOW }).filter((f) => f.severity === "fail" || f.severity === "warn"), [], r.id);
});

// ---- tested

test("evals-present fails with no evals and with fewer than three", () => {
  assert.deepEqual(sev("evals-present", skill("valid-basic")), ["fail"]);
  const d = copySkill("tested");
  const e = JSON.parse(readFileSync(join(d, "evals/evals.json"), "utf8"));
  e.evals = e.evals.slice(0, 2);
  setJson(d, "evals/evals.json", e);
  assert.deepEqual(sev("evals-present", d), ["fail"]);
  writeFileSync(join(d, "evals/evals.json"), "{nope");
  assert.deepEqual(sev("evals-present", d), ["fail"]);
});

test("evals-present accepts a bare array and `assertions`", () => {
  const d = copySkill("tested");
  const e = JSON.parse(readFileSync(join(d, "evals/evals.json"), "utf8"));
  setJson(d, "evals/evals.json", e.evals.map(({ expectations, ...c }) => ({ ...c, assertions: expectations })));
  assert.deepEqual(sev("evals-present", d), []);
  assert.deepEqual(sev("evals-verifiable", d), []);
});

test("evals-verifiable fails on a case with no expectation", () => {
  const d = copySkill("tested");
  const e = JSON.parse(readFileSync(join(d, "evals/evals.json"), "utf8"));
  e.evals[1].expectations = [];
  setJson(d, "evals/evals.json", e);
  assert.deepEqual(sev("evals-verifiable", d), ["fail"]);
});

test("triggers-present fails when missing, short, or one-sided", () => {
  assert.deepEqual(sev("triggers-present", skill("valid-basic")), ["fail"]);
  const d = copySkill("tested");
  const t = JSON.parse(readFileSync(join(d, "evals/triggers.json"), "utf8"));
  setJson(d, "evals/triggers.json", t.slice(0, 9));
  assert.deepEqual(sev("triggers-present", d), ["fail"]);
  setJson(d, "evals/triggers.json", t.map((x) => ({ ...x, should_trigger: true })));
  assert.deepEqual(sev("triggers-present", d), ["fail"]);
});

// ---- superskill

test("golden-approved fails with no golden and with an unapproved one", () => {
  assert.deepEqual(sev("golden-approved", skill("tested")), ["fail"]);
  const d = copySkill("superskill");
  rmSync(join(d, "goldens/g1/APPROVAL.json"));
  assert.deepEqual(sev("golden-approved", d), ["fail"]);
  setJson(d, "goldens/g1/APPROVAL.json", { approved_by: "", approved_at: "2026-09-10" });
  assert.deepEqual(sev("golden-approved", d), ["fail"]);
});

test("GUARD: golden-approved says when approvals rest on judgment only, and stops once an outcome is recorded", () => {
  const d = copySkill("superskill");
  const judgmentOnly = rule("golden-approved").check(loadSkill(d), { now: NOW }).map((x) => x.message).join(" ");
  assert.match(judgmentOnly, /judgment only, no outcome recorded yet/);
  setJson(d, "goldens/g1/APPROVAL.json", { approvals: [
    { approved_by: "Ann Example", approved_at: "2026-09-10T15:00:00Z", rationale: "Right shape", basis: "judgment" },
    { approved_by: "Ann Example", approved_at: "2026-09-20T15:00:00Z", rationale: "My manager used it as is", basis: "outcome", evidence: "Sent 2026-09-19, adopted as the team template" },
  ] });
  const proven = rule("golden-approved").check(loadSkill(d), { now: NOW }).map((x) => x.message).join(" ");
  assert.doesNotMatch(proven, /judgment only/);
  assert.match(proven, /g1: 1 judgment, 1 outcome/);
});

test("misses-log-present fails with no MISSES.md", () => {
  assert.deepEqual(sev("misses-log-present", skill("tested")), ["fail"]);
});

test("no-stale-open-miss fails only past 14 days", () => {
  const d = copySkill("superskill");
  writeFileSync(join(d, "MISSES.md"), "# Misses\n\n## m1 · 2026-09-20 · open\n- What happened: x\n- Fix:\n- Eval:\n");
  assert.deepEqual(sev("no-stale-open-miss", d), []);
  writeFileSync(join(d, "MISSES.md"), "# Misses\n\n## m1 · 2026-09-01 · open\n- What happened: x\n- Fix:\n- Eval:\n");
  assert.deepEqual(sev("no-stale-open-miss", d), ["fail"]);
});

test("fixed-miss-has-eval fails when the eval id is absent or empty", () => {
  const d = copySkill("superskill");
  writeFileSync(join(d, "MISSES.md"), "# Misses\n\n## m1 · 2026-09-15 · fixed\n- What happened: x\n- Fix: abc\n- Eval: m9\n");
  assert.deepEqual(sev("fixed-miss-has-eval", d), ["fail"]);
  writeFileSync(join(d, "MISSES.md"), "# Misses\n\n## m1 · 2026-09-15 · fixed\n- What happened: x\n- Fix: abc\n- Eval:\n");
  assert.deepEqual(sev("fixed-miss-has-eval", d), ["fail"]);
  writeFileSync(join(d, "MISSES.md"), "# Misses\n\n## m1 · 2026-09-15 · fixed\n- What happened: x\n- Fix: abc\n- Eval: g1\n");
  assert.deepEqual(sev("fixed-miss-has-eval", d), [], "a golden id also guards a miss");
});

test("run-evidence fails with no run and when the skill does not beat the baseline", () => {
  assert.deepEqual(sev("run-evidence", skill("tested")), ["fail"]);
  const d = copySkill("superskill");
  const p = "evals/results/latest.json";
  const r = JSON.parse(readFileSync(join(d, p), "utf8"));
  setJson(d, p, { ...r, without_skill: { ...r.without_skill, pass_rate: 1.0 } });
  assert.deepEqual(sev("run-evidence", d), ["fail"]);
});

test("run-fresh: weekly stale after 30 days, yearly warns then fails after 365", () => {
  const d = copySkill("superskill");
  assert.deepEqual(sev("run-fresh", d, new Date("2026-10-15T00:00:00Z")), []);
  assert.deepEqual(sev("run-fresh", d, new Date("2026-10-25T00:00:00Z")), ["fail"]);
  assert.deepEqual(sev("run-fresh", skill("stale-yearly")), ["fail"]);
  const y = copySkill("stale-yearly");
  const p = "evals/results/latest.json";
  const r = JSON.parse(readFileSync(join(y, p), "utf8"));
  setJson(y, p, { ...r, run_at: "2026-03-01T00:00:00Z" });
  assert.deepEqual(sev("run-fresh", y), ["warn"], "a fresh yearly proof still warns to re-run before next use");
});

test("run-fresh with no cadence uses 30 days and says so", () => {
  const d = copySkill("superskill");
  const skillMd = readFileSync(join(d, "SKILL.md"), "utf8").replace(/metadata:\n  cadence: weekly\n/, "");
  writeFileSync(join(d, "SKILL.md"), skillMd);
  const f = rule("run-fresh").check(loadSkill(d), { now: NOW });
  assert.ok(f.some((x) => x.severity === "info" && /cadence/.test(x.message)));
  assert.deepEqual(sev("run-fresh", d, new Date("2026-10-25T00:00:00Z")), ["fail"]);
});
