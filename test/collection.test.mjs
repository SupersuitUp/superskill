import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { collection, listingEntry, jaccard, pluginReport } from "../src/collection.mjs";
import { BIN, FIX, tmp, skill } from "./helpers.mjs";

const COL = join(FIX, "collection");
const PLUGIN = join(FIX, "plugin");
const run = (...args) => spawnSync(process.execPath, [BIN, ...args], { encoding: "utf8" });

test("listingEntry is name, colon, description (plus when_to_use)", () => {
  assert.equal(listingEntry({ name: "a", description: "does b" }), "a: does b");
  assert.equal(listingEntry({ name: "a", description: "does b", when_to_use: "when c" }), "a: does b when c");
});

test("budget sums every entry and reports against each harness", () => {
  const r = collection([COL]);
  assert.equal(r.skills.length, 3);
  const total = r.skills.reduce((n, s) => n + s.chars, 0);
  assert.equal(r.total_chars, total);
  assert.deepEqual(r.budgets.map((b) => b.harness).sort(), ["claude-code", "codex"]);
  assert.ok(r.budgets.every((b) => b.limit === 8000 && b.over === 0));
});

test("--budget overrides the limit and reports the overflow", () => {
  const r = collection([COL], { budget: 100 });
  assert.ok(r.budgets.every((b) => b.limit === 100 && b.over === r.total_chars - 100));
});

test("an entry over 1536 characters is named as cut off", () => {
  const r = collection([join(FIX, "skills")]);
  const cut = r.truncated.map((t) => t.name);
  assert.deepEqual(cut, [], "1100-char description fits the per-entry cap");
  const root = tmp();
  cpSync(skill("valid-basic"), join(root, "valid-basic"), { recursive: true });
  writeFileSync(join(root, "valid-basic", "SKILL.md"), `---\nname: valid-basic\ndescription: "Use when ${"x ".repeat(800)}"\n---\n`);
  const r2 = collection([root]);
  assert.deepEqual(r2.truncated.map((t) => t.name), ["valid-basic"]);
  assert.ok(r2.truncated[0].chars > 1536);
  assert.equal(r2.skills[0].listed_chars, 1536, "the listing counts only what the harness shows");
});

test("near-duplicate descriptions are flagged with near-miss suggestions both ways", () => {
  const r = collection([COL]);
  assert.equal(r.overlaps.length, 1);
  const o = r.overlaps[0];
  assert.deepEqual([o.a, o.b].sort(), ["status-note", "weekly-summary"]);
  assert.ok(o.score >= 0.5);
  assert.equal(o.suggest.length, 2);
  assert.ok(o.suggest.every((s) => s.trigger.should_trigger === false && s.trigger.query));
  assert.ok(jaccard("resize image png", "weekly status note") < 0.1);
});

test("--overlap threshold is configurable", () => {
  assert.equal(collection([COL], { overlap: 0.99 }).overlaps.length, 0);
});

test("plugin report: version, missing changelog entry, duplicated helper", () => {
  const p = pluginReport(PLUGIN);
  assert.equal(p.name, "demo-plugin");
  assert.equal(p.version, "1.2.0");
  assert.equal(p.changelog_has_version, false);
  assert.equal(p.duplicates.length, 1);
  assert.deepEqual(p.duplicates[0].files.sort(), ["skills/alpha/scripts/slug.mjs", "skills/beta/scripts/slug.mjs"]);
  assert.ok(p.findings.some((f) => /CHANGELOG/.test(f.message)));
  assert.ok(p.findings.some((f) => /share this helper/.test(f.fix)));
  assert.equal(pluginReport(COL), null, "not a plugin");
});

test("collection CLI: human output, --json, exit codes", () => {
  const h = run("collection", COL);
  assert.equal(h.status, 0, h.stderr);
  assert.match(h.stdout, /claude-code/);
  assert.match(h.stdout, /status-note.*weekly-summary|weekly-summary.*status-note/);
  const j = run("collection", COL, "--json");
  assert.equal(JSON.parse(j.stdout).skills.length, 3);
  assert.equal(run("collection", COL, "--budget", "50").status, 1, "over budget exits 1");
  assert.equal(run("collection", join(tmp(), "none")).status, 2);
});

test("doctor on a plugin root adds the plugin line and the superplugin verdict", () => {
  const r = run("doctor", PLUGIN, "--json");
  const doc = JSON.parse(r.stdout);
  assert.equal(doc.plugin.version, "1.2.0");
  assert.equal(doc.plugin.superplugin, false);
  const h = run("doctor", PLUGIN);
  assert.match(h.stdout, /plugin demo-plugin 1\.2\.0/);
});
