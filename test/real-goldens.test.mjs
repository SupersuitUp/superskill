// 0.5.0 made a golden from a real run the top-level requirement; 0.6.0 made goldens optional
// evidence. What stays: provenance decides whether a golden is a real run, placeholder evals are
// not evals, and a sandbox run is never a use. Each GUARD below was broken on purpose and seen red.
import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, rmSync, readFileSync, mkdirSync, cpSync, existsSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { loadSkill } from "../src/context.mjs";
import { superskillRules } from "../src/rules/superskill.mjs";
import { testedRules } from "../src/rules/tested.mjs";
import { scoreSkill } from "../src/doctor.mjs";
import { originOf } from "../src/goldens.mjs";
import { ledgerMisses, acceptedRate } from "../src/ledger.mjs";
import { BIN, copySkill, tmp, NOW } from "./helpers.mjs";

const rule = (id) => [...testedRules, ...superskillRules].find((r) => r.id === id);
const level = (dir, opts = {}) => scoreSkill(dir, { now: NOW, ...opts }).level;
const setJson = (dir, rel, v) => writeFileSync(join(dir, rel), JSON.stringify(v, null, 2));
const REAL = { source: "real-run", run: { session: "abc" }, accepted: { by: "Ann Example", at: "2026-09-09T16:05:00Z" } };

test("an approved golden with no provenance is named as not a real run, and changes no level", () => {
  const d = copySkill("superskill");
  rmSync(join(d, "goldens/g1/PROVENANCE.json"));
  assert.equal(level(d), "superskill");
  const msg = rule("golden-approved").check(loadSkill(d), { now: NOW }).map((f) => f.message).join(" ");
  assert.match(msg, /not from a real run a person accepted: g1 no PROVENANCE\.json/);
});

test("a synthetic golden is named as such and is not reported as real evidence", () => {
  const d = copySkill("superskill");
  setJson(d, "goldens/g1/PROVENANCE.json", { ...REAL, source: "synthetic" });
  const msg = rule("golden-approved").check(loadSkill(d), { now: NOW }).map((f) => f.message).join(" ");
  assert.match(msg, /g1 source is "synthetic"/);
  assert.doesNotMatch(msg, /real goldens/);
});

test("a real-run golden needs a run reference and a person who accepted it, with a date", () => {
  assert.equal(originOf(REAL).real, true);
  assert.match(originOf({ ...REAL, run: {} }).why, /names no run/);
  assert.match(originOf({ ...REAL, accepted: { at: "2026-09-09" } }).why, /accepted\.by/);
  assert.match(originOf({ ...REAL, accepted: { by: "Ann", at: "not a date" } }).why, /accepted\.at/);
  assert.equal(originOf({ source: "real-run", derived_from: "sha256:x", accepted: { by: "the operator", at: "2026-09-09" } }).real, true);
});

test("GUARD: an anonymized twin counts only with the anonymizer's receipt", () => {
  const d = copySkill("superskill");
  setJson(d, "goldens/g1/PROVENANCE.json", { source: "real-run", anonymized: true, derived_from: "sha256:abc", accepted: { by: "the operator", at: "2026-09-09T16:05:00Z" } });
  assert.match(scoreSkill(d, { now: NOW }).findings.map((f) => f.message).join(" "), /no ANONYMIZED\.json receipt/);
  setJson(d, "goldens/g1/ANONYMIZED.json", { checker: "anonymize-for-sharing", fingerprint: "sha256:def", counts: { person: 2 } });
  assert.match(scoreSkill(d, { now: NOW }).findings.map((f) => f.message).join(" "), /real goldens \(optional evidence\): g1/);
  assert.equal(scoreSkill(d, { now: NOW }).findings.some((f) => f.message.includes("ANONYMIZED")), false);
});

test("a private golden (kept outside the skill) counts, and approve writes into it", () => {
  const d = copySkill("superskill");
  rmSync(join(d, "goldens"), { recursive: true });
  const priv = tmp("private-goldens-");
  const g = join(priv, "superskill", "g-2026-10-06");
  mkdirSync(g, { recursive: true });
  writeFileSync(join(g, "input.md"), "Here are my tasks: shipped login.\n");
  writeFileSync(join(g, "output.md"), "## Atlas\n- Shipped login\n");
  setJson(g, "PROVENANCE.json", REAL);
  const name = loadSkill(d).data.name;
  assert.equal(name, "superskill", "the skill name decides the private folder");
  const real = (o) => rule("golden-approved").check(loadSkill(d), { now: NOW, ...o }).map((f) => f.message).join(" ");
  // Not approved yet: not reported as real evidence.
  assert.doesNotMatch(real({ privateGoldens: priv }), /real goldens/);
  const r = spawnSync(process.execPath, [BIN, "approve", d, "g-2026-10-06", "--private-goldens", priv, "--approved-by", "Ann Example", "--via", "AskUserQuestion", "--rationale", "accepted when it ran"], { encoding: "utf8", env: { ...process.env, SUPERSKILL_NOW: "2026-09-28T12:00:00Z" } });
  assert.equal(r.status, 0, r.stderr);
  assert.ok(existsSync(join(g, "APPROVAL.json")), "the approval lands beside the private golden");
  assert.ok(!existsSync(join(d, "goldens")), "nothing is written into the skill");
  assert.match(real({ privateGoldens: priv }), /real goldens \(optional evidence\): g-2026-10-06/);
  assert.equal(real({}), "", "without the private folder the skill has no golden");
});

test("GUARD: init placeholders are not evals (evals-real)", () => {
  const d = copySkill("tested");
  const ev = JSON.parse(readFileSync(join(d, "evals/evals.json"), "utf8"));
  ev.evals[0].prompt = "REPLACE: a real request this skill handles";
  setJson(d, "evals/evals.json", ev);
  assert.equal(level(d), "skill");
  assert.match(rule("evals-real").check(loadSkill(d)).map((f) => f.message).join(" "), /REPLACE: placeholder/);
});

test("GUARD: a placeholder trigger, or the same request twice, is not a case", () => {
  const d = copySkill("tested");
  const tr = JSON.parse(readFileSync(join(d, "evals/triggers.json"), "utf8"));
  const list = Array.isArray(tr) ? tr : tr.triggers;
  list[0].query = "REPLACE: a realistic request that should load this skill";
  setJson(d, "evals/triggers.json", tr);
  assert.equal(level(d), "skill");
  const d2 = copySkill("tested");
  const ev = JSON.parse(readFileSync(join(d2, "evals/evals.json"), "utf8"));
  ev.evals[1].prompt = ev.evals[0].prompt;
  setJson(d2, "evals/evals.json", ev);
  assert.match(rule("evals-real").check(loadSkill(d2)).map((f) => f.message).join(" "), /repeated/);
  assert.equal(level(d2), "skill");
});

test("init --from-session writes a golden that cannot count until someone accepted it", () => {
  const d = copySkill("tested");
  const sess = join(tmp(), "s.jsonl");
  writeFileSync(sess, [{ type: "user", message: { content: "write my status" } }, { type: "assistant", message: { content: [{ type: "text", text: "## Atlas" }] } }].map((x) => JSON.stringify(x)).join("\n"));
  const r = spawnSync(process.execPath, [BIN, "init", d, "--from-session", sess], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  const prov = JSON.parse(readFileSync(join(d, "goldens/s1/PROVENANCE.json"), "utf8"));
  assert.equal(prov.source, "real-run");
  assert.equal(originOf(prov).real, false);
});

test("GUARD: a sandbox run in the ledger is never a miss; a correction points at the next message", () => {
  const f = join(tmp(), "l.jsonl");
  writeFileSync(f, [
    { id: "a", skill: "freedom:demo", synthetic: true, outcome: "failed", started: "2026-10-05T03:21:00Z" },
    { id: "b", skill: "freedom:demo", session_id: "88696e1b-99c8", started: "2026-10-05T10:00:00Z", outcome: "succeeded_with_rescues", corrected_after: true,
      interventions: [{ kind: "correction", what: "wrong engine" }], next_turn: "correction_suspect", next_turn_ref: { at: "2026-10-05T10:20:00Z", offset: 1234 } },
  ].map((x) => JSON.stringify(x)).join("\n") + "\n");
  const misses = ledgerMisses(f, new Set(), "demo");
  assert.deepEqual(misses.map((m) => m.source), ["freedom-ledger b"]);
  assert.match(misses[0].expected, /session 88696e1b at 2026-10-05T10:20:00Z, transcript byte 1234/);
});

test("acceptedRate counts judged runs only, in the window, and never a sandbox run", () => {
  const f = join(tmp(), "l.jsonl");
  const rec = (o) => JSON.stringify({ started: "2026-09-20T10:00:00Z", outcome: "one_shot", ...o });
  writeFileSync(f, [rec({ next_turn: "go" }), rec({ next_turn: "close" }), rec({ next_turn: "correction_suspect", corrected_after: true }),
    rec({ next_turn: null }), rec({ next_turn: "go", synthetic: true }), rec({ next_turn: "go", started: "2026-07-01T00:00:00Z" })].join("\n"));
  assert.deepEqual(acceptedRate([f], { now: NOW, days: 30 }), { judged: 3, accepted: 2, synthetic: 1 });
});

test("with no record file, real-runs reads Freedom's ledger live, per model+harness, never a sandbox run", () => {
  const d = copySkill("superskill");
  rmSync(join(d, "evals/real-runs.json"));
  const rec = (o) => JSON.stringify({ skill: "superskill", started: "2026-09-20T10:00:00Z", outcome: "succeeded", model: "claude-opus-5-5", harness: "claude-code", ...o });
  writeFileSync(join(d, "invocations.jsonl"), [rec({}), rec({}), rec({}), rec({}), rec({ interventions: [{ kind: "correction" }] }), rec({ synthetic: true }), rec({ model: "gpt-6", harness: "codex" })].join("\n") + "\n");
  const msgs = scoreSkill(d, { now: NOW }).findings.filter((f) => f.rule === "real-runs").map((f) => `${f.severity} ${f.message}`);
  assert.ok(msgs.includes("info real runs, claude-opus-5-5 / claude-code: 4 of 5 one-shot (80%)"), msgs.join("\n"));
  assert.ok(msgs.includes("info real runs, gpt-6 / codex: 1 of 1 one-shot (100%)"), msgs.join("\n"));
  assert.equal(level(d), "superskill");
});
