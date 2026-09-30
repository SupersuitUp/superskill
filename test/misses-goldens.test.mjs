import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseMisses, readMisses, appendMisses, updateMiss, nextMissId } from "../src/misses.mjs";
import { readGoldens, isApproved, approvalsOf, approvalEntry, withApproval, weightOf } from "../src/goldens.mjs";
import { skill, copySkill, tmp } from "./helpers.mjs";

test("readMisses parses the fixture entry", () => {
  const [m] = readMisses(skill("superskill"));
  assert.equal(m.id, "m1");
  assert.equal(m.date, "2026-09-15");
  assert.equal(m.status, "fixed");
  assert.match(m.what, /twice/);
  assert.match(m.expected, /Merged/);
  assert.equal(m.fix, "a1b2c3d");
  assert.equal(m.eval, "m1");
});

test("readMisses returns null with no file", () => {
  assert.equal(readMisses(skill("valid-basic")), null);
});

test("parseMisses accepts | and - separators and ignores other headings", () => {
  const m = parseMisses("# Misses\n\n## m2 | 2026-01-02 | open\n- What happened: a\n\n## Notes\n- Eval: nope\n## m3 - 2026-01-03 - fixed\n- Eval: e3\n");
  assert.deepEqual(m.map((x) => [x.id, x.status, x.eval]), [["m2", "open", ""], ["m3", "fixed", "e3"]]);
  assert.equal(nextMissId(m), "m4");
});

test("appendMisses then updateMiss round-trips and leaves other entries alone", () => {
  const d = tmp();
  appendMisses(d, [{ id: "m1", date: "2026-09-01", status: "open", what: "one" }, { id: "m2", date: "2026-09-02", status: "open", what: "two" }]);
  assert.equal(updateMiss(d, "m1", { status: "fixed", eval: "e1", fix: "abc" }), true);
  const ms = readMisses(d);
  assert.deepEqual(ms.map((m) => [m.id, m.status, m.eval, m.what]), [["m1", "fixed", "e1", "one"], ["m2", "open", "", "two"]]);
  assert.match(readFileSync(join(d, "MISSES.md"), "utf8"), /^# Misses/);
  assert.equal(updateMiss(d, "m9", { status: "fixed" }), false);
});

test("readGoldens finds input, output and approval", () => {
  const [g] = readGoldens(skill("superskill"));
  assert.equal(g.id, "g1");
  assert.match(g.input, /shipped login/);
  assert.match(g.output, /Atlas/);
  assert.equal(g.approval.approved_by, "Ann Example");
  assert.ok(isApproved(g));
});

test("a golden with no APPROVAL.json is not approved", () => {
  assert.deepEqual(readGoldens(skill("tested")), []);
  const d = copySkill("superskill");
  const [g] = readGoldens(d);
  assert.ok(isApproved(g));
  assert.equal(isApproved({ approval: { approved_by: "x", approved_at: "not a date" } }), false);
});

// ---- approval basis and weight (0.3.0): liked is not proven

test("a pre-0.3.0 approval reads as one judgment approval, its note as the rationale", () => {
  const [a] = approvalsOf({ approved_by: "Ann Example", approved_at: "2026-09-10T15:00:00Z", skill_sha: "x", note: "Exactly the shape I send." });
  assert.equal(a.basis, "judgment");
  assert.equal(a.rationale, "Exactly the shape I send.");
});

test("GUARD: an approval without a rationale is refused, and an outcome without evidence is refused", () => {
  assert.match(approvalEntry({ name: "Gary", rationale: "", at: "2026-09-29T00:00:00Z" }).error, /rationale/);
  assert.match(approvalEntry({ name: "Gary", rationale: "It reads right", basis: "outcome", at: "2026-09-29T00:00:00Z" }).error, /evidence/);
  assert.match(approvalEntry({ name: "Gary", rationale: "x", basis: "vibes", at: "2026-09-29T00:00:00Z" }).error, /basis/);
  assert.equal(approvalEntry({ name: "Gary", rationale: "It reads right", at: "2026-09-29T00:00:00Z" }).entry.basis, "judgment");
});

test("approvals accumulate: two people, then an outcome, all kept, newest mirrored at the top", () => {
  const e1 = approvalEntry({ name: "Gary", rationale: "Reads right", at: "2026-09-29T00:00:00Z", sha: "s" }).entry;
  const e2 = approvalEntry({ name: "Wilson", rationale: "Would send it", at: "2026-09-29T01:00:00Z", sha: "s" }).entry;
  const e3 = approvalEntry({ name: "Gary", rationale: "It booked a call", basis: "outcome", evidence: "Call with a CEO booked 2026-10-02 from this letter; CRM row 14", at: "2026-10-02T00:00:00Z", sha: "s" }).entry;
  const file = withApproval(withApproval(withApproval(null, e1), e2), e3);
  assert.equal(file.approvals.length, 3);
  assert.equal(file.approved_by, "Gary");
  const g = { approval: file };
  assert.ok(isApproved(g));
  assert.deepEqual(weightOf(g), { judgment: 2, outcome: 1 });
});
