import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, copyFileSync } from "node:fs";
import { join } from "node:path";
import { BIN, FIX, copySkill, tmp } from "./helpers.mjs";
import { readMisses } from "../src/misses.mjs";
import { ledgerMisses } from "../src/ledger.mjs";

const LEDGER = join(FIX, "ledger.jsonl");
const run = (home, ...args) => spawnSync(process.execPath, [BIN, ...args], { encoding: "utf8", env: { ...process.env, HOME: home, SUPERSKILL_NOW: "2026-09-28T12:00:00Z" } });

test("ledgerMisses keeps corrections, rescues, redirects and failures; skips taste and clean runs", () => {
  const recs = ledgerMisses(LEDGER, new Set());
  assert.deepEqual(recs.map((r) => r.source), ["freedom-ledger inv_b", "freedom-ledger inv_c"]);
  assert.match(recs[0].what, /grouped by date/);
  assert.match(recs[1].what, /failed/);
  assert.equal(recs[0].date, "2026-09-21");
});

test("miss import --freedom-ledger --ledger imports 2 misses, then 0 on rerun", () => {
  const d = copySkill("valid-basic");
  const home = tmp();
  const r = run(home, "miss", "import", d, "--freedom-ledger", "--ledger", LEDGER);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /2 new/);
  const ms = readMisses(d);
  assert.deepEqual(ms.map((m) => [m.id, m.status, m.source]), [["m1", "open", "freedom-ledger inv_b"], ["m2", "open", "freedom-ledger inv_c"]]);
  const again = run(home, "miss", "import", d, "--freedom-ledger", "--ledger", LEDGER);
  assert.match(again.stdout, /0 new/);
  assert.equal(readMisses(d).length, 2);
});

test("with no --ledger it finds ~/.freedom/ledger/skills/*/<skill>.jsonl", () => {
  const d = copySkill("valid-basic");
  const home = tmp();
  mkdirSync(join(home, ".freedom/ledger/skills/some-plugin"), { recursive: true });
  copyFileSync(LEDGER, join(home, ".freedom/ledger/skills/some-plugin/valid-basic.jsonl"));
  const r = run(home, "misses", "import", d, "--freedom-ledger");
  assert.equal(r.status, 0, r.stderr);
  assert.equal(readMisses(d).length, 2);
});

test("with no ledger anywhere it says so and changes nothing", () => {
  const d = copySkill("valid-basic");
  const r = run(tmp(), "miss", "import", d, "--freedom-ledger");
  assert.equal(r.status, 0);
  assert.match(r.stdout, /no Freedom ledger/);
  assert.equal(readMisses(d), null);
});

test("import without a source flag is a usage error", () => {
  assert.equal(run(tmp(), "miss", "import", copySkill("valid-basic")).status, 2);
});
