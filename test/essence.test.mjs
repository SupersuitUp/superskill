import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { loadSkill } from "../src/context.mjs";
import { interopRules } from "../src/rules/interop.mjs";
import { copySkill, NOW } from "./helpers.mjs";

const rule = interopRules.find((r) => r.id === "essence-shape");
const withFiles = (extra) => {
  const dir = copySkill("valid-basic");
  for (const [p, c] of Object.entries(extra)) {
    mkdirSync(dirname(join(dir, p)), { recursive: true });
    writeFileSync(join(dir, p), c);
  }
  return dir;
};
const run = (dir) => rule.check(loadSkill(dir), { now: NOW });

const FULL = [
  "# Essence: thing",
  "## The outcome", "x",
  "## The rigor worth inheriting", "- x",
  "## What stays private", "- slot",
  "## The rebuild interview", "1. q",
  "## Where it came from", "x",
].join("\n");

test("essence-shape is silent without an ESSENCE.md", () => {
  assert.deepEqual(run(copySkill("valid-basic")), []);
});

test("essence-shape reports a complete essence as info", () => {
  const f = run(withFiles({ "ESSENCE.md": FULL }));
  assert.deepEqual(f.map((x) => x.severity), ["info"]);
});

test("essence-shape warns once per missing part, naming it", () => {
  const f = run(withFiles({ "ESSENCE.md": "# Essence\n## The outcome\nx\n## Where it came from\nx\n" }));
  assert.deepEqual(f.map((x) => x.severity), ["warn"]);
  assert.match(f[0].message, /rigor worth inheriting/);
  assert.match(f[0].message, /stays private/);
  assert.match(f[0].message, /rebuild interview/);
});
