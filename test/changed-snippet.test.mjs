import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, writeFileSync, readFileSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import { BIN, skill, tmp } from "./helpers.mjs";

const run = (cwd, ...args) => spawnSync(process.execPath, [BIN, ...args], { cwd, encoding: "utf8", env: { ...process.env, SUPERSKILL_NOW: "2026-09-28T12:00:00Z" } });
const git = (cwd, ...args) => {
  const r = spawnSync("git", args, { cwd, encoding: "utf8", env: { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@example.invalid", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@example.invalid" } });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout;
};

function repo() {
  const root = tmp();
  git(root, "init", "-q");
  for (const n of ["valid-basic", "tested"]) cpSync(skill(n), join(root, "skills", n), { recursive: true });
  git(root, "add", ".");
  git(root, "commit", "-q", "-m", "init");
  return root;
}

test("--changed scores only skills with a working-tree change", () => {
  const root = repo();
  appendFileSync(join(root, "skills", "tested", "SKILL.md"), "\n4. Keep it short.\n");
  const r = run(root, "doctor", "skills", "--changed", "--json");
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(JSON.parse(r.stdout).skills.map((s) => s.name), ["tested"]);
});

test("--changed --base scores skills changed since a ref, including committed ones", () => {
  const root = repo();
  const base = git(root, "rev-parse", "HEAD").trim();
  appendFileSync(join(root, "skills", "valid-basic", "references", "template.md"), "- more\n");
  git(root, "commit", "-qam", "edit");
  const r = run(root, "doctor", "skills", "--changed", "--base", base, "--json");
  assert.deepEqual(JSON.parse(r.stdout).skills.map((s) => s.name), ["valid-basic"]);
});

test("--changed with nothing touched says so and exits 0", () => {
  const root = repo();
  const r = run(root, "doctor", "skills", "--changed");
  assert.equal(r.status, 0);
  assert.match(r.stdout, /no changed skills/);
});

test("--baseline-json refuses a change that drops a skill's level", () => {
  const root = repo();
  const before = run(root, "doctor", "skills", "--json");
  const baseline = join(tmp(), "baseline.json");
  writeFileSync(baseline, before.stdout);
  // delete the triggers file: tested falls back to skill
  const p = join(root, "skills", "tested", "evals", "triggers.json");
  writeFileSync(p, "[]");
  const r = run(root, "doctor", "skills", "--changed", "--baseline-json", baseline);
  assert.equal(r.status, 1, r.stdout);
  assert.match(r.stdout, /dropped from tested to skill/);
  // an improvement is fine
  writeFileSync(p, readFileSync(join(skill("tested"), "evals", "triggers.json")));
  appendFileSync(join(root, "skills", "valid-basic", "SKILL.md"), "\n");
  assert.equal(run(root, "doctor", "skills", "--changed", "--baseline-json", baseline).status, 0);
});

test("--changed outside a git repo is a usage error", () => {
  const d = tmp();
  cpSync(skill("valid-basic"), join(d, "valid-basic"), { recursive: true });
  assert.equal(run(d, "doctor", d, "--changed").status, 2);
});

test("snippet prints the three commands an agent needs", () => {
  const r = spawnSync(process.execPath, [BIN, "snippet"], { encoding: "utf8" });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /superskill init .*--from-session/);
  assert.match(r.stdout, /superskill miss/);
  assert.match(r.stdout, /superskill doctor/);
});
