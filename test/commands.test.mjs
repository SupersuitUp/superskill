import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { BIN, copySkill, tmp, FIX } from "./helpers.mjs";
import { readMisses } from "../src/misses.mjs";
import { readEvals, readTriggers } from "../src/evals.mjs";

const run = (...args) => spawnSync(process.execPath, [BIN, ...args], { encoding: "utf8", env: { ...process.env, SUPERSKILL_NOW: "2026-09-28T12:00:00Z" } });
const read = (d, p) => readFileSync(join(d, p), "utf8");

// ---- init

test("init adds evals, triggers, goldens and MISSES.md to a plain skill", () => {
  const d = copySkill("valid-basic");
  const r = run("init", d);
  assert.equal(r.status, 0, r.stderr);
  const e = readEvals(d);
  assert.equal(e.cases.length, 1);
  assert.equal(e.skill_name, "valid-basic");
  assert.ok(e.cases[0].assertions.length);
  const t = readTriggers(d).triggers;
  assert.ok(t.some((x) => x.should_trigger) && t.some((x) => !x.should_trigger));
  assert.ok(existsSync(join(d, "goldens/.gitkeep")));
  assert.deepEqual(readMisses(d), []);
});

test("init never overwrites an existing file", () => {
  const d = copySkill("tested");
  const before = read(d, "evals/evals.json");
  const tb = read(d, "evals/triggers.json");
  writeFileSync(join(d, "MISSES.md"), "# my own misses file\n");
  const r = run("init", d);
  assert.equal(r.status, 0);
  assert.equal(read(d, "evals/evals.json"), before);
  assert.equal(read(d, "evals/triggers.json"), tb);
  assert.equal(read(d, "MISSES.md"), "# my own misses file\n");
  assert.match(r.stdout, /kept/);
});

test("init refuses a folder with no SKILL.md", () => {
  assert.equal(run("init", tmp()).status, 2);
});

test("init --from-session turns a transcript into eval s1 and an unapproved golden", () => {
  const d = copySkill("valid-basic");
  const r = run("init", d, "--from-session", join(FIX, "sessions", "session.jsonl"));
  assert.equal(r.status, 0, r.stderr);
  const e = readEvals(d);
  const s1 = e.cases.find((c) => c.id === "s1");
  assert.ok(s1, "eval s1 exists");
  assert.match(s1.prompt, /weekly status/);
  assert.deepEqual(s1.assertions, ["Output addresses the request in the prompt"]);
  assert.equal(e.cases.length, 1, "no example case beside the real one");
  assert.match(read(d, "goldens/s1/input.md"), /weekly status/);
  assert.match(read(d, "goldens/s1/output.md"), /Atlas/);
  assert.ok(!existsSync(join(d, "goldens/s1/APPROVAL.json")), "a person approves, not init");
});

test("init --from-session accepts a plain text file as the prompt", () => {
  const d = copySkill("valid-basic");
  const p = join(tmp(), "req.md");
  writeFileSync(p, "Please write my weekly status from these tasks.\n");
  assert.equal(run("init", d, "--from-session", p).status, 0);
  assert.match(read(d, "goldens/s1/input.md"), /Please write/);
  assert.equal(read(d, "goldens/s1/output.md"), "");
});

test("init --from-session on an existing evals.json appends the next free sN", () => {
  const d = copySkill("tested");
  const r = run("init", d, "--from-session", join(FIX, "sessions", "session.jsonl"));
  assert.equal(r.status, 0, r.stderr);
  const ids = readEvals(d).cases.map((c) => String(c.id));
  assert.deepEqual(ids, ["1", "2", "3", "s1"]);
  run("init", d, "--from-session", join(FIX, "sessions", "session.jsonl"));
  assert.deepEqual(readEvals(d).cases.map((c) => String(c.id)), ["1", "2", "3", "s1", "s2"]);
  assert.ok(existsSync(join(d, "goldens/s2/input.md")));
});

// ---- miss / fix

test("miss appends an open entry with the next id and today's date", () => {
  const d = copySkill("superskill");
  const r = run("miss", d, "Listed a task twice again", "--expected", "One line per task");
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /m2/);
  const m = readMisses(d).find((x) => x.id === "m2");
  assert.deepEqual([m.date, m.status, m.what, m.expected], ["2026-09-28", "open", "Listed a task twice again", "One line per task"]);
});

test("miss creates MISSES.md when absent", () => {
  const d = copySkill("valid-basic");
  assert.equal(run("miss", d, "wrong").status, 0);
  assert.equal(readMisses(d)[0].id, "m1");
});

test("fix closes a miss with a real eval id", () => {
  const d = copySkill("superskill");
  run("miss", d, "x");
  const r = run("fix", d, "m2", "--eval", "2", "--commit", "deadbee");
  assert.equal(r.status, 0, r.stderr + r.stdout);
  const m = readMisses(d).find((x) => x.id === "m2");
  assert.deepEqual([m.status, m.eval, m.fix], ["fixed", "2", "deadbee"]);
});

test("fix refuses without a regression eval, or with one that does not exist", () => {
  const d = copySkill("superskill");
  run("miss", d, "x");
  assert.equal(run("fix", d, "m2").status, 2, "missing --eval is a usage error");
  const r = run("fix", d, "m2", "--eval", "nope");
  assert.equal(r.status, 1);
  assert.match(r.stderr, /nope/);
  assert.equal(readMisses(d).find((x) => x.id === "m2").status, "open");
  assert.equal(run("fix", d, "m7", "--eval", "2").status, 1, "unknown miss");
});

// ---- approve

test("approve refuses when no person is at a terminal", () => {
  const d = copySkill("tested");
  mkdirSync(join(d, "goldens/g1"), { recursive: true });
  writeFileSync(join(d, "goldens/g1/input.md"), "in");
  writeFileSync(join(d, "goldens/g1/output.md"), "out");
  const r = spawnSync(process.execPath, [BIN, "approve", d, "g1"], { encoding: "utf8", input: "Mallory\n" });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /approval needs a person at a terminal/);
  assert.ok(!existsSync(join(d, "goldens/g1/APPROVAL.json")));
});
