import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, cpSync } from "node:fs";
import { join } from "node:path";
import { BIN, skill, tmp, FIX } from "./helpers.mjs";

const run = (...args) => spawnSync(process.execPath, [BIN, ...args], { encoding: "utf8", env: { ...process.env, SUPERSKILL_NOW: "2026-09-28T12:00:00Z" } });

test("doctor exits 0 on a valid skill and names its level", () => {
  const r = run("doctor", skill("valid-basic"));
  assert.equal(r.status, 0, r.stderr + r.stdout);
  assert.match(r.stdout, /valid-basic/);
  assert.match(r.stdout, /level: skill/);
  assert.match(r.stdout, /to reach tested:/);
});

test("doctor exits 1 below the target level", () => {
  const r = run("doctor", skill("bad-name"));
  assert.equal(r.status, 1);
  assert.match(r.stdout, /level: none/);
  assert.match(r.stdout, /to reach skill:/);
  assert.match(r.stdout, /name-format/);
});

test("doctor exits 2 on a missing path", () => {
  const r = run("doctor", join(tmp(), "nope"));
  assert.equal(r.status, 2);
  assert.match(r.stderr, /not found|does not exist/i);
});

test("doctor exits 2 on a folder with no skills", () => {
  const r = run("doctor", tmp());
  assert.equal(r.status, 2);
  assert.match(r.stderr, /no skills/i);
});

test("--json prints one parseable document with levels", () => {
  const r = run("doctor", skill("valid-basic"), "--json");
  assert.equal(r.status, 0);
  const doc = JSON.parse(r.stdout);
  assert.equal(doc.skills.length, 1);
  assert.equal(doc.skills[0].level, "skill");
  assert.equal(doc.skills[0].name, "valid-basic");
  assert.ok(Array.isArray(doc.skills[0].findings));
  assert.ok(Array.isArray(doc.skills[0].next));
  assert.equal(doc.ok, true);
});

test("--level tested on a plain skill exits 1", () => {
  const r = run("doctor", skill("valid-basic"), "--level", "tested");
  assert.equal(r.status, 1);
});

test("--level with an unknown value is a usage error", () => {
  assert.equal(run("doctor", skill("valid-basic"), "--level", "gold").status, 2);
});

test("freedom-style skill passes and shows the workflow map bonus line", () => {
  const r = run("doctor", skill("freedom-style"));
  assert.equal(r.status, 0, r.stdout);
  assert.match(r.stdout, /workflow map \(HDSOP\.md\) present/);
});

test("a folder of skills is scanned, one entry per child with SKILL.md", () => {
  const root = tmp();
  for (const n of ["valid-basic", "bad-name"]) cpSync(skill(n), join(root, n), { recursive: true });
  mkdirSync(join(root, "not-a-skill"));
  const r = run("doctor", root, "--json");
  assert.equal(r.status, 1);
  const doc = JSON.parse(r.stdout);
  assert.deepEqual(doc.skills.map((s) => s.name).sort(), ["Bad_Name", "valid-basic"]);
});

test("a plugin folder scans skills/*/SKILL.md", () => {
  const root = tmp();
  mkdirSync(join(root, "skills"));
  cpSync(skill("valid-basic"), join(root, "skills", "valid-basic"), { recursive: true });
  const r = run("doctor", root, "--json");
  assert.equal(r.status, 0, r.stderr);
  assert.equal(JSON.parse(r.stdout).skills.length, 1);
});

test("--help prints usage for superskill and for doctor", () => {
  const a = run("--help");
  assert.equal(a.status, 0);
  assert.match(a.stdout, /doctor/);
  assert.match(a.stdout, /collection/);
  const b = run("doctor", "--help");
  assert.equal(b.status, 0);
  assert.match(b.stdout, /--level/);
});

test("an unknown command is a usage error", () => {
  assert.equal(run("frobnicate").status, 2);
});

test("fixtures folder itself scans without crashing", () => {
  const r = run("doctor", join(FIX, "skills"), "--json");
  assert.ok(r.status === 0 || r.status === 1, r.stderr);
  const doc = JSON.parse(r.stdout);
  assert.ok(doc.skills.length >= 10);
});
