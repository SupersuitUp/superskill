import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { BIN, FIX, copySkill } from "./helpers.mjs";
import { gradeMachine, parseVerdict, compileRegex } from "../src/run/grade.mjs";
import { collectCases, estimateCalls } from "../src/run/index.mjs";

const FAKE = join(FIX, "fake-harness.mjs");
const env = { ...process.env, SUPERSKILL_FAKE_HARNESS: FAKE, SUPERSKILL_NOW: "2026-09-28T12:00:00Z" };
const run = (...args) => spawnSync(process.execPath, [BIN, ...args], { encoding: "utf8", env });

test("machine graders: contains, regex with (?i), file_exists", () => {
  assert.equal(gradeMachine("contains:login", { output: "shipped login" }).pass, true);
  assert.equal(gradeMachine("contains:login", { output: "nothing" }).pass, false);
  assert.equal(gradeMachine("regex:(?i)atlas", { output: "ATLAS" }).pass, true);
  assert.equal(gradeMachine("regex:^## ", { output: "intro\n## A" }).pass, true, "multiline by default");
  assert.equal(gradeMachine("file_exists:out.md", { output: "", cwd: FIX }).pass, false);
  assert.equal(gradeMachine("file_exists:fake-harness.mjs", { output: "", cwd: FIX }).pass, true);
  assert.equal(gradeMachine("regex:(", { output: "" }).pass, false, "a bad regex fails, never throws");
  assert.ok(compileRegex("(?i)x").flags.includes("i"));
});

test("parseVerdict accepts JSON inside prose and fails anything unclear", () => {
  assert.deepEqual(parseVerdict('ok {"pass": true, "reason": "r"}'), { pass: true, reason: "r" });
  assert.equal(parseVerdict('{"pass": "yes"}').pass, false);
  assert.equal(parseVerdict("no json").pass, false);
});

test("collectCases includes goldens and estimateCalls counts grader calls", () => {
  const cases = collectCases(join(FIX, "skills", "superskill"));
  assert.deepEqual(cases.map((c) => c.id), ["1", "2", "3", "m1", "golden:g1"]);
  // 5 cases x 3 x 2 = 30 runs; plain-language: case 1 has one, golden has one -> 2 x 3 x 2 = 12
  assert.deepEqual(estimateCalls(cases, 3), { runs: 30, grader: 12, total: 42 });
});

test("--run refuses without --yes when no terminal, after printing the estimate", () => {
  const d = copySkill("tested");
  const r = run("doctor", d, "--run");
  assert.equal(r.status, 1);
  assert.match(r.stderr, /estimated model calls: 24/);
  assert.match(r.stderr, /--yes/);
  assert.ok(!existsSync(join(d, "evals/results/latest.json")));
});

test("--run --yes writes latest.json with with/without pass rates", () => {
  const d = copySkill("tested");
  const r = run("doctor", d, "--run", "--yes");
  assert.equal(r.status, 0, r.stderr);
  const latest = JSON.parse(readFileSync(join(d, "evals/results/latest.json"), "utf8"));
  assert.equal(latest.run_at, "2026-09-28T12:00:00.000Z");
  assert.equal(latest.harness, "fake");
  assert.equal(latest.model, "fake-model-1");
  assert.equal(latest.cases, 3);
  assert.equal(latest.repeat, 3);
  assert.equal(latest.with_skill.pass_rate, 1);
  assert.equal(latest.without_skill.pass_rate, 0);
  assert.equal(latest.with_skill.mean_tokens, 120);
  assert.equal(latest.per_case.length, 3);
  assert.deepEqual(latest.per_case[0].with_skill, { runs: 3, passes: 3 });
});

test("after --run, the doctor counts the run as evidence", () => {
  const d = copySkill("superskill");
  const r = run("doctor", d, "--run", "--yes", "--repeat", "1");
  assert.equal(r.status, 0, r.stderr);
  const doc = JSON.parse(run("doctor", d, "--json", "--level", "superskill").stdout);
  assert.equal(doc.skills[0].level, "superskill");
});

test("--run --help explains the cost", () => {
  const r = run("doctor", "--run", "--help");
  assert.equal(r.status, 0);
  assert.match(r.stdout, /model calls/);
});
