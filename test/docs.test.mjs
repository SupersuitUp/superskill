import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { allRules } from "../src/rules/index.mjs";
import { ROOT } from "./helpers.mjs";

const read = (f) => readFileSync(join(ROOT, f), "utf8");

test("SPEC.md documents every rule the doctor runs", () => {
  const spec = read("SPEC.md");
  for (const r of allRules) assert.ok(spec.includes("`" + r.id + "`"), `SPEC.md is missing ${r.id}`);
});

test("SPEC.md and package.json agree on the version", () => {
  const v = JSON.parse(read("package.json")).version;
  assert.match(read("SPEC.md"), new RegExp(`\\*\\*Version ${v.replace(/\./g, "\\.")}\\*\\*`));
  assert.match(read("CHANGELOG.md"), new RegExp(`^## ${v.replace(/\./g, "\\.")}`, "m"));
});

test("README lists every command the CLI dispatches", () => {
  const readme = read("README.md");
  const bin = read("bin/superskill.mjs");
  const cmds = [...bin.matchAll(/^\s{2}(\w+): "\.\.\/src\/commands\//gm)].map((m) => m[1]).filter((c) => c !== "misses");
  assert.ok(cmds.length >= 7);
  for (const c of cmds) assert.ok(readme.includes(`superskill ${c}`), `README is missing ${c}`);
});

test("package.json has zero runtime dependencies and ships the bin", () => {
  const pkg = JSON.parse(read("package.json"));
  assert.deepEqual(pkg.dependencies || {}, {});
  assert.equal(pkg.bin.superskill, "bin/superskill.mjs");
  assert.equal(pkg.type, "module");
  assert.ok(!pkg.files.some((f) => f.startsWith("test")), "tests and the corpus report are not shipped");
});

test("no source file imports anything outside node: builtins and the package itself", () => {
  const files = [];
  const walk = (d) => { for (const n of readdirSync(d)) { const p = join(d, n); statSync(p).isDirectory() ? walk(p) : p.endsWith(".mjs") && files.push(p); } };
  walk(join(ROOT, "src")); walk(join(ROOT, "bin"));
  for (const f of files) {
    for (const m of readFileSync(f, "utf8").matchAll(/(?:from|import\()\s*["']([^"']+)["']/g)) {
      assert.ok(m[1].startsWith("node:") || m[1].startsWith("."), `${f} imports ${m[1]}`);
    }
  }
});
