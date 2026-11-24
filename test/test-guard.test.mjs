// A fixed miss guarded by a test in the skill's own repo (ContinentalWorks/supersuit-dev#1310):
// `Eval: test:<path>#<test name>`, the path found from the skill folder upward.
import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { spawnSync } from "node:child_process";
import { loadSkill } from "../src/context.mjs";
import { superskillRules } from "../src/rules/superskill.mjs";
import { parseTestRef, guardProblem } from "../src/guards.mjs";
import { copySkill, BIN } from "./helpers.mjs";

const rule = superskillRules.find((r) => r.id === "fixed-miss-has-eval");
const fails = (dir) => rule.check(loadSkill(dir)).filter((f) => f.severity === "fail").map((f) => f.message);
const miss = (ev) => `# Misses\n\n## m1 · 2026-09-15 · fixed\n- What happened: x\n- Fix: abc\n- Eval: ${ev}\n`;

/** A skill folder with a repo-style tests/ folder beside it, holding one named test. */
function withRepoTest() {
  const d = copySkill("superskill");
  const tests = join(dirname(d), "tests");
  mkdirSync(tests, { recursive: true });
  writeFileSync(join(tests, "lib.test.mjs"), 'test("a library refusal holds", () => {});\n');
  return d;
}

test("parseTestRef reads test:<path>#<name>, quotes optional, and ignores plain ids", () => {
  assert.deepEqual(parseTestRef('test:tests/a.test.mjs#"the name"'), { path: "tests/a.test.mjs", name: "the name" });
  assert.deepEqual(parseTestRef("test:tests/a.test.mjs#the name"), { path: "tests/a.test.mjs", name: "the name" });
  assert.equal(parseTestRef("m1"), null);
});

test("a fixed miss naming a test that exists, with that name in it, passes fixed-miss-has-eval", () => {
  const d = withRepoTest();
  writeFileSync(join(d, "MISSES.md"), miss("test:tests/lib.test.mjs#a library refusal holds"));
  assert.deepEqual(fails(d), []);
});

test("a missing test file, a missing name, or no #name each fail, with the reason", () => {
  const d = withRepoTest();
  writeFileSync(join(d, "MISSES.md"), miss("test:tests/nope.test.mjs#a library refusal holds"));
  assert.match(fails(d)[0], /was not found/);
  writeFileSync(join(d, "MISSES.md"), miss("test:tests/lib.test.mjs#some other test"));
  assert.match(fails(d)[0], /has no test named "some other test"/);
  writeFileSync(join(d, "MISSES.md"), miss("test:tests/lib.test.mjs"));
  assert.match(fails(d)[0], /test:<path>#<test name>/);
});

test("a plain id keeps the evals.json/goldens rule and its wording", () => {
  const d = withRepoTest();
  writeFileSync(join(d, "MISSES.md"), miss("m9"));
  assert.match(fails(d)[0], /names eval "m9", which is not in evals.json or goldens\//);
  assert.equal(guardProblem(d, "m1"), null);
});

test("superskill fix accepts a test: guard and refuses one that names nothing", () => {
  const d = withRepoTest();
  writeFileSync(join(d, "MISSES.md"), "# Misses\n\n## m1 · 2026-09-15 · open\n- What happened: x\n- Fix:\n- Eval:\n");
  const bad = spawnSync(process.execPath, [BIN, "fix", d, "m1", "--eval", "test:tests/lib.test.mjs#nothing"], { encoding: "utf8" });
  assert.notEqual(bad.status, 0);
  const ok = spawnSync(process.execPath, [BIN, "fix", d, "m1", "--eval", "test:tests/lib.test.mjs#a library refusal holds"], { encoding: "utf8" });
  assert.equal(ok.status, 0, ok.stderr);
  assert.match(readFileSync(join(d, "MISSES.md"), "utf8"), /- Eval: test:tests\/lib\.test\.mjs#a library refusal holds/);
});

// ContinentalWorks/supersuit-dev#4002: the guard matched any text in the file, so a run-time
// title was refused while a comment's words or an import line were accepted.
function withTitledTests(src, name = "gen.test.mjs") {
  const d = copySkill("superskill");
  const tests = join(dirname(d), "tests");
  mkdirSync(tests, { recursive: true });
  writeFileSync(join(tests, name), src);
  return d;
}
const GEN = [
  'import assert from "node:assert/strict";',
  "// the old wording projected the total, see the review",
  'for (const file of ["SKILL.md", "steps/1.md"]) {',
  "  test(`${file} never projects the total`, () => {});",
  "}",
  'test("a url in a title, https://example.com/x, is not a comment", () => {});',
  "",
].join("\n");

test("GUARD: a title built at run time is accepted by its run-time name, and by its literal part", () => {
  const d = withTitledTests(GEN);
  assert.equal(guardProblem(d, "test:tests/gen.test.mjs#SKILL.md never projects the total"), null);
  assert.equal(guardProblem(d, "test:tests/gen.test.mjs#never projects the total"), null);
  assert.equal(guardProblem(d, "test:tests/gen.test.mjs#https://example.com/x, is not a comment"), null);
});

test("GUARD: a comment's words or an import line do not guard a miss, and the refusal says what to pass", () => {
  const d = withTitledTests(GEN);
  const c = guardProblem(d, "test:tests/gen.test.mjs#the old wording projected the total");
  assert.match(c, /has no test named "the old wording projected the total": pass the test's title, or a literal part of a title built at run time/);
  assert.match(guardProblem(d, "test:tests/gen.test.mjs#import assert"), /has no test named/);
  const py = withTitledTests("# 2851: rebuild after two stalls\ndef test_rebuild_after_two_stalls():\n    '''supersuit-dev#2851: kept'''\n", "test_x.py");
  assert.match(guardProblem(py, "test:tests/test_x.py#rebuild after two stalls"), /has no test named/);
  assert.equal(guardProblem(py, "test:tests/test_x.py#test_rebuild_after_two_stalls"), null);
  assert.equal(guardProblem(py, "test:tests/test_x.py#supersuit-dev#2851"), null); // a docstring is code, not a comment
});

test("GUARD: superskill fix refuses a comment guard; a miss closed by one before 0.11.1 warns in the doctor rather than failing", () => {
  const d = withTitledTests(GEN);
  writeFileSync(join(d, "MISSES.md"), "# Misses\n\n## m1 · 2026-09-15 · open\n- What happened: x\n- Fix:\n- Eval:\n");
  const bad = spawnSync(process.execPath, [BIN, "fix", d, "m1", "--eval", "test:tests/gen.test.mjs#the old wording projected the total"], { encoding: "utf8" });
  assert.notEqual(bad.status, 0);
  const ok = spawnSync(process.execPath, [BIN, "fix", d, "m1", "--eval", "test:tests/gen.test.mjs#SKILL.md never projects the total"], { encoding: "utf8" });
  assert.equal(ok.status, 0, ok.stderr);
  writeFileSync(join(d, "MISSES.md"), miss("test:tests/gen.test.mjs#the old wording projected the total"));
  const found = rule.check(loadSkill(d));
  assert.deepEqual(found.map((x) => x.severity), ["warn"]);
  assert.match(found[0].message, /miss m1: .*has no test named/);
});
