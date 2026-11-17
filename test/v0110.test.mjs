// 0.11.0: a skill (metadata.reads_before_acting / metadata.writes_back; reads and writes are deprecated aliases) that declares what it reads and writes names each file's root and its exact facts,
// and its body carries the steps that do the reading and the writing. The model never sees a
// skill's frontmatter, so the declaration has force only through a body step that matches it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadSkill } from "../src/context.mjs";
import { skillRules } from "../src/rules/skill.mjs";
import { copySkill, NOW } from "./helpers.mjs";

const rule = (id) => {
  const r = skillRules.find((x) => x.id === id);
  assert.ok(r, `rule ${id} exists`);
  return r;
};
const check = (id, dir) => rule(id).check(loadSkill(dir), { now: NOW });
const fails = (id, dir) => check(id, dir).filter((f) => f.severity === "fail");
const GOOD_DESC = "description: Does the thing. Use when someone asks for the thing.";

function variant(meta, body) {
  const dir = copySkill("valid-basic");
  writeFileSync(join(dir, "SKILL.md"), `---\nname: valid-basic\n${GOOD_DESC}\n${meta}\n---\n\n${body}`);
  return dir;
}

const META = [
  "metadata:",
  "  reads_before_acting:",
  "    - root: operator",
  "      file: self/expenses.md",
  "      facts:",
  "        - which card is whose, by last four digits",
  "        - vendors the operator ruled are never company spending",
  "  writes_back:",
  "    - root: company",
  "      file: finance/tallies/owner.csv",
  "      facts:",
  "        - each expense kept, with its receipt, card and purpose",
].join("\n");

const BODY = [
  "# Expenses",
  "",
  "## What this skill reads first",
  "",
  "Read `self/expenses.md` in the operator's workspace: which card is whose, and the vendors ruled out.",
  "",
  "## Steps",
  "",
  "1. File each one.",
  "",
  "## What this skill writes back",
  "",
  "Each kept expense goes in `finance/tallies/owner.csv` in the company workspace.",
  "",
].join("\n");

test("metadata-reads-writes passes when every entry names its root and facts and the body steps match", () => {
  assert.deepEqual(check("metadata-reads-writes", variant(META, BODY)), []);
  // The entry form is a list, which the string-map rule must not refuse.
  assert.deepEqual(check("metadata-string-map", variant(META, BODY)), []);
});

test("metadata-reads-writes says nothing about a skill that declares neither, or the 0.8 kinds string", () => {
  assert.deepEqual(check("metadata-reads-writes", variant("metadata:\n  cadence: weekly", "# Body\n")), []);
  assert.deepEqual(check("metadata-reads-writes", variant("metadata:\n  reads_before_acting: friend, document\n  writes_back: piece", "# Body\n")), []);
  // The 0.8 kinds string under the old names is not checked either, only warned as deprecated.
  const old = check("metadata-reads-writes", variant("metadata:\n  reads: friend, document\n  writes: piece", "# Body\n"));
  assert.deepEqual(old.map((f) => f.severity), ["warn", "warn"]);
});

test("metadata-reads-writes fails when the body has no reads-first step, naming what is missing", () => {
  const body = BODY.replace("## What this skill reads first", "## Before you start");
  const out = fails("metadata-reads-writes", variant(META, body));
  assert.equal(out.length, 1);
  assert.match(out[0].message, /no "What this skill reads first" step/);
  assert.match(out[0].message, /self\/expenses\.md/);
});

test("metadata-reads-writes fails when the writes-back step does not name a declared file", () => {
  const body = BODY.replace("`finance/tallies/owner.csv`", "the tally");
  const out = fails("metadata-reads-writes", variant(META, body));
  assert.equal(out.length, 1);
  assert.match(out[0].message, /"What this skill writes back" step does not name finance\/tallies\/owner\.csv/);
});

test("metadata-reads-writes fails a facts list that only restates the file", () => {
  for (const fact of ["self/expenses.md", "expenses.md", "expenses", "the whole file", "everything in self/expenses.md"]) {
    const meta = META.replace("which card is whose, by last four digits", fact);
    const out = fails("metadata-reads-writes", variant(meta, BODY));
    assert.equal(out.length, 1, `"${fact}" fails`);
    assert.match(out[0].message, /only restates the file/);
  }
});

test("metadata-reads-writes fails an entry with no root, a wrong root, no file or empty facts", () => {
  const cases = [
    [META.replace("    - root: operator\n      file", "    - file"), /reads_before_acting entry 1 .*root/],
    [META.replace("root: operator", "root: home"), /reads_before_acting entry 1 .*root "home"/],
    [META.replace("      file: self/expenses.md\n", ""), /reads_before_acting entry 1 has no file/],
    [META.replace("      facts:\n        - each expense kept, with its receipt, card and purpose", "      facts: []"), /writes_back entry 1 \(finance\/tallies\/owner\.csv\) names no facts/],
  ];
  for (const [meta, re] of cases) {
    const out = fails("metadata-reads-writes", variant(meta, BODY));
    assert.ok(out.some((f) => re.test(f.message)), `expected ${re} in ${JSON.stringify(out.map((f) => f.message))}`);
  }
});

test("metadata-reads-writes warns on a body step no metadata declares", () => {
  const out = check("metadata-reads-writes", variant("metadata:\n  cadence: weekly", BODY));
  assert.ok(out.length >= 1);
  assert.ok(out.every((f) => f.severity === "warn"));
  assert.match(out[0].message, /metadata\.reads_before_acting/);
});

test("metadata-reads-writes counts only a heading or a step that starts with the title, never a mention in prose", () => {
  const prose = "# Making skills\n\nThe body opens with a step titled \"What this skill reads first\".\n";
  assert.deepEqual(check("metadata-reads-writes", variant("metadata:\n  cadence: weekly", prose)), []);
  const step = "# Expenses\n\n1. **What this skill reads first.** Read `self/expenses.md`.\n\n## Steps\n\n- File it.\n\n- What this skill writes back: `finance/tallies/owner.csv`.\n";
  assert.deepEqual(check("metadata-reads-writes", variant(META, step)), []);
});

test("the old names reads and writes are accepted for one version, checked the same, and warned as deprecated", () => {
  const old = META.replace("reads_before_acting:", "reads:").replace("writes_back:", "writes:");
  const out = check("metadata-reads-writes", variant(old, BODY));
  assert.deepEqual(out.filter((f) => f.severity === "fail"), []);
  const warns = out.filter((f) => f.severity === "warn").map((f) => f.message).join("\n");
  assert.match(warns, /metadata\.reads is the old name: write metadata\.reads_before_acting/);
  assert.match(warns, /metadata\.writes is the old name: write metadata\.writes_back/);
  assert.deepEqual(check("metadata-string-map", variant(old, BODY)), []);
  // An old-name entry list is held to the body steps too.
  const bad = fails("metadata-reads-writes", variant(old, BODY.replace("## What this skill reads first", "## Before")));
  assert.match(bad[0].message, /metadata\.reads_before_acting declares self\/expenses\.md/);
});

test("when both names are present the new one is read and the old one ignored", () => {
  const both = META + "\n  reads:\n    - root: home\n      file: elsewhere.md\n      facts: []";
  const out = check("metadata-reads-writes", variant(both, BODY));
  assert.deepEqual(out.filter((f) => f.severity === "fail"), []);
  assert.match(out.map((f) => f.message).join("\n"), /metadata\.reads is ignored: metadata\.reads_before_acting is set/);
});
