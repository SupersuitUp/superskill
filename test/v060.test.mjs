// 0.6.0: the top level is earned by closed misses, a passing suite and trigger set against the
// current SKILL.md, and a real-run record per model+harness. Dated incident stories belong in
// MISSES.md. Each GUARD below was broken on purpose and seen red.
import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, readFileSync, rmSync, mkdirSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { loadSkill } from "../src/context.mjs";
import { superskillRules } from "../src/rules/superskill.mjs";
import { skillRules, historyLines } from "../src/rules/skill.mjs";
import { scoreSkill } from "../src/doctor.mjs";
import { parseMisses, formatMiss } from "../src/misses.mjs";
import { meetsBar, pairsFromRecords, readRealRuns } from "../src/realruns.mjs";
import { thresholds } from "../src/commands/doctor.mjs";
import { BIN, FIX, copySkill, tmp, NOW } from "./helpers.mjs";

const all = [...skillRules, ...superskillRules];
const rule = (id) => all.find((r) => r.id === id);
const check = (id, dir, opts = {}) => rule(id).check(loadSkill(dir), { now: NOW, ...opts });
const sev = (id, dir, opts) => check(id, dir, opts).map((f) => f.severity).filter((s) => s !== "info");
const level = (dir, opts = {}) => scoreSkill(dir, { now: NOW, ...opts }).level;
const readJ = (d, rel) => JSON.parse(readFileSync(join(d, rel), "utf8"));
const setJ = (d, rel, v) => writeFileSync(join(d, rel), JSON.stringify(v, null, 2));
const LATEST = "evals/results/latest.json";
const RUNS = "evals/real-runs.json";

// ---- evals-pass

test("GUARD: a pass recorded against an earlier SKILL.md does not count", () => {
  const d = copySkill("superskill");
  assert.deepEqual(sev("evals-pass", d), []);
  appendFileSync(join(d, "SKILL.md"), "\nOne more instruction.\n");
  assert.match(check("evals-pass", d).map((f) => f.message).join(" "), /earlier SKILL\.md/);
  assert.equal(level(d), "tested");
});

test("GUARD: a run with no skill_sha, no trigger results, or a weak suite fails evals-pass", () => {
  const d = copySkill("superskill");
  const r = readJ(d, LATEST);
  setJ(d, LATEST, { ...r, skill_sha: undefined });
  assert.match(check("evals-pass", d).map((f) => f.message).join(" "), /no skill_sha/);
  setJ(d, LATEST, { ...r, triggers: undefined });
  assert.match(check("evals-pass", d).map((f) => f.message).join(" "), /did not run the trigger evals/);
  setJ(d, LATEST, { ...r, triggers: { ...r.triggers, pass_rate: 0.75 } });
  assert.match(check("evals-pass", d).map((f) => f.message).join(" "), /trigger evals 75% right \(needs 90%\)/);
  setJ(d, LATEST, { ...r, with_skill: { ...r.with_skill, pass_rate: 0.8 } });
  assert.match(check("evals-pass", d).map((f) => f.message).join(" "), /suite passed 80% of runs with the skill \(needs 90%\)/);
  assert.deepEqual(sev("evals-pass", d, { minPassRate: 0.8 }), [], "the threshold is configurable");
});

test("GUARD: a fixed miss whose regression eval passed only some runs is a miss that came back", () => {
  const d = copySkill("superskill");
  const r = readJ(d, LATEST);
  setJ(d, LATEST, { ...r, per_case: r.per_case.map((c) => (c.id === "m1" ? { ...c, with_skill: { runs: 3, passes: 2 } } : c)) });
  assert.match(check("evals-pass", d).map((f) => f.message).join(" "), /regression eval m1 \(miss m1\) passed 2 of 3 runs/);
  setJ(d, LATEST, { ...r, per_case: r.per_case.filter((c) => c.id !== "m1") });
  assert.match(check("evals-pass", d).map((f) => f.message).join(" "), /regression eval m1 \(miss m1\) is not in the last --run/);
});

// ---- real-runs

test("GUARD: no real-run record means no superskill", () => {
  const d = copySkill("superskill");
  rmSync(join(d, RUNS));
  process.env.FREEDOM_SKILL_LEDGER_HOME = tmp("no-ledger-");
  try {
    assert.match(check("real-runs", d).map((f) => f.message).join(" "), /no real-run record \(needs at least 5 real runs and 80% one-shot on one model\+harness\)/);
    assert.equal(level(d), "tested");
  } finally { delete process.env.FREEDOM_SKILL_LEDGER_HOME; }
});

test("GUARD: pairs are never pooled; each model+harness clears the bar alone", () => {
  const d = copySkill("superskill");
  // 4+4 runs, all one-shot: pooled would be 8 runs at 100%; neither pair alone has 5.
  setJ(d, RUNS, { format: "superskill-real-runs/1", pairs: [
    { model: "claude-opus-5-5", harness: "claude-code", runs: 4, one_shot: 4 },
    { model: "gpt-6", harness: "codex", runs: 4, one_shot: 4 },
  ] });
  const msgs = check("real-runs", d).map((f) => `${f.severity} ${f.message}`);
  assert.ok(msgs.includes("info real runs, claude-opus-5-5 / claude-code: 4 of 4 one-shot (100%)"));
  assert.ok(msgs.includes("info real runs, gpt-6 / codex: 4 of 4 one-shot (100%)"));
  assert.ok(msgs.some((m) => m.startsWith("fail real-run record below the bar")));
  assert.deepEqual(sev("real-runs", d, { minRealRuns: 4 }), [], "the run count is configurable");
});

test("GUARD: a pair that does not say its model or harness never counts toward the bar", () => {
  const d = copySkill("superskill");
  setJ(d, RUNS, { format: "superskill-real-runs/1", pairs: [{ model: "unknown", harness: "claude-code", runs: 40, one_shot: 40 }] });
  const msgs = check("real-runs", d).map((f) => `${f.severity} ${f.message}`);
  assert.ok(msgs.some((m) => /unknown \/ claude-code: 40 of 40 one-shot \(100%\), not counted/.test(m)), msgs.join("\n"));
  assert.ok(msgs.some((m) => /no run names its model and harness/.test(m)));
});

test("real-runs: one-shot below the bar fails, and the share is configurable", () => {
  const d = copySkill("superskill");
  setJ(d, RUNS, { format: "superskill-real-runs/1", pairs: [{ model: "claude-opus-5-5", harness: "claude-code", runs: 10, one_shot: 7 }] });
  assert.deepEqual(sev("real-runs", d), ["fail"]);
  assert.deepEqual(sev("real-runs", d, { minOneShot: 0.7 }), []);
});

test("real-runs: an operator's export dir wins over the file in the skill; a bad file is named", () => {
  const d = copySkill("superskill");
  const ext = tmp("real-runs-");
  setJ(ext, "superskill.json", { format: "superskill-real-runs/1", pairs: [{ model: "m", harness: "h", runs: 1, one_shot: 1 }] });
  assert.deepEqual(sev("real-runs", d, { realRuns: ext }), ["fail"]);
  assert.equal(readRealRuns(d, { name: "superskill", realRunsDir: ext }).where, `${ext}/superskill.json`);
  writeFileSync(join(d, RUNS), "{ nope");
  assert.match(check("real-runs", d).map((f) => f.message).join(" "), /evals\/real-runs\.json is not valid JSON/);
  setJ(d, RUNS, { format: "something-else/2", pairs: [] });
  assert.match(check("real-runs", d).map((f) => f.message).join(" "), /not superskill-real-runs\/1/);
});

test("pairsFromRecords counts one-shot the documented way: taste is fine, a correction or failure is not", () => {
  const base = { skill: "freedom:x", model: "m", harness: "h", started: "2026-09-20T10:00:00Z" };
  const pairs = pairsFromRecords([
    { ...base }, { ...base, interventions: [{ kind: "taste" }] }, { ...base, interventions: [{ kind: "rescue" }] },
    { ...base, outcome: "failed" }, { ...base, outcome: "abandoned" }, { ...base, corrected_after: true },
    { ...base, synthetic: true }, { ...base, skill: "freedom:other" },
  ], "x");
  assert.deepEqual(pairs.map((p) => [p.model, p.harness, p.runs, p.one_shot]), [["m", "h", 6, 2]]);
  assert.equal(meetsBar(pairs, { minRuns: 5, minOneShot: 0.3 }).length, 1);
  assert.equal(meetsBar(pairs).length, 0);
});

test("doctor thresholds: flags win over env, out-of-range values are refused", () => {
  assert.deepEqual(thresholds({ "min-real-runs": "8" }, { SUPERSKILL_MIN_ONE_SHOT: "0.9" }), { realRuns: null, minRealRuns: 8, minOneShot: 0.9, minPassRate: undefined, minTriggerRate: undefined });
  assert.throws(() => thresholds({ "min-one-shot": "80" }, {}), /from 0 to 1/);
  assert.throws(() => thresholds({ "min-real-runs": "0" }, {}), /at least 1/);
  const d = copySkill("superskill");
  const r = spawnSync(process.execPath, [BIN, "doctor", d, "--level", "superskill", "--min-real-runs", "50"], { encoding: "utf8", env: { ...process.env, SUPERSKILL_NOW: NOW.toISOString() } });
  assert.equal(r.status, 1, "a raised bar drops the fixture below superskill");
});

// ---- misses: the story lives here

test("a miss entry holds the story: continuation lines and a quote", () => {
  const [m] = parseMisses("# Misses\n\n## m4 · 2026-09-14 · fixed\n- What happened: An operator watched five keychain dialogs\n  during a setup, and the session named the fix and left it.\n- Fix: the rule in SKILL.md, Fix it\n- Eval: m4\n- Quote: \"fix this bro\"\n");
  assert.equal(m.what, "An operator watched five keychain dialogs during a setup, and the session named the fix and left it.");
  assert.equal(m.quote, "\"fix this bro\"");
  assert.match(formatMiss(m), /- Quote: "fix this bro"/);
});

// ---- history-in-skill

test("GUARD: history-in-skill flags dated incident stories, including ones the line wrap splits", () => {
  const body = [
    "**Ask before sending.** Earned 2026-09-08, watching a first activation.",
    "",
    "Default to keep building (Gary, 2026-10-01: *\"keep building is default\"*).",
    "",
    "The operator said so. Gary,",
    "2026-09-13: *\"every update text should include a link\"*",
    "",
    "Until 2026-09-21 the flag did nothing, and on 2026-09-13 a session sat for fifteen minutes.",
    "",
    "- 2026-09-15 (freedom-dev#147): the lib moved.",
  ].join("\n");
  assert.deepEqual(historyLines(body).map((h) => h.lineNo), [1, 3, 6, 8, 10]);
});

test("GUARD: history-in-skill leaves examples, templates, code and provenance stamps alone", () => {
  const body = [
    "- Example: 6:30pm Austin on 2026-05-02 maps to an offset.",
    "Name files `2026-09-01-090000-brief.md`.",
    "```",
    "on 2026-09-13 inside a fence (Gary, 2026-09-13: \"x\")",
    "```",
    "<!-- Vendored from upstream by scripts/vendor.mjs on 2026-09-19. Edit the patch layer. -->",
    "## Measured on 2026-09-14",
    "The selectors are as of 2026-09-24 and change.",
    "messages filed from 2025-11-02 onward are read.",
  ].join("\n");
  assert.deepEqual(historyLines(body), []);
});

test("history-in-skill warns (never fails) with line numbers in SKILL.md", () => {
  const d = copySkill("tested");
  const fm = readFileSync(join(d, "SKILL.md"), "utf8");
  writeFileSync(join(d, "SKILL.md"), fm + "\nNever skip the check. Earned 2026-09-08, when a run skipped it.\n");
  const [f] = check("history-in-skill", d);
  assert.equal(f.severity, "warn");
  assert.match(f.message, /1 dated incident story in SKILL\.md \(line \d+: Never skip the check\. Earned 2026-09-08/);
  assert.match(f.fix, /MISSES\.md/);
  assert.equal(level(d), "tested", "a warning never moves a level");
});

test("GUARD: there is still no line-count rule (the 2026-09-28 ruling stands)", () => {
  assert.equal(all.some((r) => /^(body-lines|line-count|max-lines)$/.test(r.id)), false);
  // A long body is never a fail or a warn by its length alone.
  const big = copySkill("huge-body");
  assert.equal(scoreSkill(big, { now: NOW }).findings.some((f) => f.rule === "body-size" && f.severity !== "info"), false);
});

// ---- --run records the sha and the triggers

test("--run records the SKILL.md it ran against and the trigger evals, and the doctor then accepts it", () => {
  const d = copySkill("superskill");
  rmSync(join(d, LATEST));
  appendFileSync(join(d, "SKILL.md"), "\nA later edit.\n");
  const env = { ...process.env, SUPERSKILL_FAKE_HARNESS: join(FIX, "fake-harness.mjs"), SUPERSKILL_NOW: "2026-09-28T12:00:00Z" };
  const r = spawnSync(process.execPath, [BIN, "doctor", d, "--run", "--yes", "--repeat", "1"], { encoding: "utf8", env });
  assert.equal(r.status, 0, r.stderr);
  const latest = readJ(d, LATEST);
  assert.match(latest.skill_sha, /^[0-9a-f]{64}$/);
  assert.equal(latest.triggers.cases, 12);
  assert.equal(latest.triggers.pass_rate, 1);
  assert.equal(level(d), "superskill");
});

test("a golden with a checklist is graded on the checklist, not on likeness to its output", async () => {
  const { collectCases } = await import("../src/run/index.mjs");
  const d = copySkill("superskill");
  setJ(d, "goldens/g1/expectations.json", ["contains:Atlas", "Every line is in the past tense"]);
  const g = collectCases(d).find((c) => c.id === "golden:g1");
  assert.deepEqual(g.assertions, ["contains:Atlas", "Every line is in the past tense"]);
  mkdirSync(join(d, "goldens/g2"));
  writeFileSync(join(d, "goldens/g2/input.md"), "status for: shipped search\n");
  setJ(d, "goldens/g2/expectations.json", ["contains:search"]);
  assert.ok(collectCases(d).some((c) => c.id === "golden:g2"), "a checklist golden needs no output.md");
});

test("Claude Code trigger detection reads a Skill call or a read of SKILL.md, nothing else", async () => {
  const { loadedSkill } = await import("../src/run/claude.mjs");
  const ev = (c) => JSON.stringify({ type: "assistant", message: { content: [c] } });
  assert.equal(loadedSkill(ev({ type: "tool_use", name: "Skill", input: { skill: "weekly-status" } }), "weekly-status"), true);
  assert.equal(loadedSkill(ev({ type: "tool_use", name: "Skill", input: { skill: "plugin:weekly-status" } }), "weekly-status"), true);
  assert.equal(loadedSkill(ev({ type: "tool_use", name: "Read", input: { file_path: "/tmp/x/.claude/skills/weekly-status/SKILL.md" } }), "weekly-status"), true);
  assert.equal(loadedSkill(ev({ type: "tool_use", name: "Skill", input: { skill: "other" } }), "weekly-status"), false);
  assert.equal(loadedSkill(ev({ type: "text", text: "weekly-status/SKILL.md" }), "weekly-status"), false);
});
