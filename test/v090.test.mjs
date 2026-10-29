// 0.9.0: a skill spends a person's attention only on what is theirs to decide. A needless question
// breaks one-shot, and two new level 1 rules (warnings) scan for asks with no recommendation and
// for menus about the skill's own running. Each GUARD below was broken on purpose and seen red.
import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { loadSkill } from "../src/context.mjs";
import { skillRules } from "../src/rules/skill.mjs";
import { scoreSkill } from "../src/doctor.mjs";
import { isOneShot, pairsFromRecords } from "../src/realruns.mjs";
import { ledgerMisses } from "../src/ledger.mjs";
import { copySkill, tmp, NOW } from "./helpers.mjs";

const rule = (id) => {
  const r = skillRules.find((x) => x.id === id);
  assert.ok(r, `rule ${id} exists`);
  return r;
};
const check = (id, dir) => rule(id).check(loadSkill(dir), { now: NOW });
const sev = (id, dir) => check(id, dir).map((f) => f.severity);
const GOOD_DESC = "description: Does the thing. Use when someone asks for the thing.";

function variant(body, extra = {}) {
  const dir = copySkill("valid-basic");
  writeFileSync(join(dir, "SKILL.md"), `---\nname: valid-basic\n${GOOD_DESC}\n---\n\n${body}`);
  for (const [p, c] of Object.entries(extra)) {
    mkdirSync(join(dir, p, ".."), { recursive: true });
    writeFileSync(join(dir, p), c);
  }
  return dir;
}

// ---- change 1: a needless question breaks one-shot

test("GUARD: a run with a needless_question intervention is not one-shot", () => {
  const base = { skill: "freedom:x", model: "m", harness: "h", started: "2026-10-29T10:00:00Z" };
  assert.equal(isOneShot(base), true);
  assert.equal(isOneShot({ ...base, interventions: [{ kind: "needless_question", note: "asked which folder" }] }), false);
  const pairs = pairsFromRecords([base, { ...base, interventions: [{ kind: "needless_question" }] }], "x");
  assert.deepEqual(pairs.map((p) => [p.runs, p.one_shot]), [[2, 1]]);
});

test("GUARD: miss import turns a needless_question into an open miss", () => {
  const ledger = join(tmp(), "ledger.jsonl");
  writeFileSync(ledger, [
    { id: "q1", skill: "valid-basic", started: "2026-10-29T10:00:00Z", outcome: "one_shot", interventions: [{ kind: "needless_question", note: "asked which folder to use" }] },
    { id: "q2", skill: "valid-basic", started: "2026-10-29T11:00:00Z", outcome: "one_shot", interventions: [{ kind: "taste", note: "shorter" }] },
  ].map((r) => JSON.stringify(r)).join("\n") + "\n");
  const ms = ledgerMisses(ledger, new Set(), "valid-basic");
  assert.deepEqual(ms.map((m) => m.source), ["freedom-ledger q1"]);
  assert.match(ms[0].what, /needless_question: asked which folder/);
});

// ---- change 3: asks-with-recommendation

test("GUARD: asks-with-recommendation warns on an ask with no recommendation", () => {
  const d = variant("# S\n\nAsk the user which folder to write into.\n");
  assert.deepEqual(sev("asks-with-recommendation", d), ["warn"]);
  const d2 = variant("# S\n\nUse `AskUserQuestion` to pick the output format.\n");
  assert.deepEqual(sev("asks-with-recommendation", d2), ["warn"]);
});

test("asks-with-recommendation is quiet when the paragraph names a recommendation", () => {
  assert.deepEqual(sev("asks-with-recommendation", variant("# S\n\nAsk the user which folder,\nleading with the one marked (Recommended).\n")), []);
  assert.deepEqual(sev("asks-with-recommendation", variant("# S\n\nConfirm with the owner before sending; the default is to hold.\n")), []);
});

test("asks-with-recommendation ignores code fences and superskill-ignore lines", () => {
  assert.deepEqual(sev("asks-with-recommendation", variant("# S\n\n```\nAsk the user which folder.\n```\n")), []);
  assert.deepEqual(sev("asks-with-recommendation", variant("# S\n\nAsk the user which folder. <!-- superskill-ignore -->\n")), []);
});

test("GUARD: asks-with-recommendation reads step files too", () => {
  const d = variant("# S\n\nBefore step 2, read [steps/2-pick.md](steps/2-pick.md).\n", { "steps/2-pick.md": "# Pick\n\nCheck with the person which template to use.\n" });
  const f = check("asks-with-recommendation", d);
  assert.deepEqual(f.map((x) => x.severity), ["warn"]);
  assert.match(f[0].message, /steps\/2-pick\.md/);
});

// ---- change 3: no-self-menu

test("GUARD: no-self-menu warns on a menu about the skill's own running", () => {
  assert.deepEqual(sev("no-self-menu", variant("# S\n\nWhen done, say: would you like me to continue?\n")), ["warn"]);
  assert.deepEqual(sev("no-self-menu", variant("# S\n\nThen ask what would you like to do next.\n")), ["warn"]);
  assert.deepEqual(sev("no-self-menu", variant("# S\n\nOffer a choice of which mode to run in.\n")), ["warn"]);
});

test("no-self-menu ignores fences, superskill-ignore, and a line that forbids the menu", () => {
  assert.deepEqual(sev("no-self-menu", variant("# S\n\n```\nwould you like me to continue?\n```\n")), []);
  assert.deepEqual(sev("no-self-menu", variant("# S\n\nwould you like me to continue? superskill-ignore\n")), []);
  assert.deepEqual(sev("no-self-menu", variant("# S\n\nNever end with \"would you like me to continue\"; keep going.\n")), []);
});

test("no-self-menu does not flag a heading or a line that only describes a mode", () => {
  assert.deepEqual(sev("no-self-menu", variant("# S\n\n## Step 0: which mode, decided by looking\n\nThe status command reports which mode is on.\n")), []);
});

// ---- both are warnings in 0.9.0: they never drop a skill a level

test("GUARD: the two attention rules warn and never fail a skill", () => {
  const d = variant("# S\n\nAsk the user which folder.\n\nThen: would you like me to continue?\n");
  const r = scoreSkill(d, { now: NOW });
  const mine = r.findings.filter((f) => ["asks-with-recommendation", "no-self-menu"].includes(f.rule));
  assert.deepEqual(mine.map((f) => f.severity).sort(), ["warn", "warn"]);
  assert.notEqual(r.level, "none");
});
