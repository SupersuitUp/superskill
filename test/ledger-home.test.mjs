// The ledger is read from the same home Freedom writes it to. FREEDOM_HOME re-points the whole
// home (Supersuit's test runner sets it to a throwaway folder), so a path built from homedir()
// alone read the operator's real ~/.freedom/ledger from inside a sandboxed run (supersuit-dev
// test-home-guard, 2026-11-11).
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ledgerPaths } from "../src/ledger.mjs";

test("ledgerPaths reads <FREEDOM_HOME>/.freedom/ledger when FREEDOM_HOME is set", () => {
  const home = mkdtempSync(join(tmpdir(), "ss-home-"));
  const p = join(home, ".freedom", "ledger", "skills", "freedom", "x.jsonl");
  mkdirSync(join(p, ".."), { recursive: true });
  writeFileSync(p, "");
  const saved = { L: process.env.FREEDOM_SKILL_LEDGER_HOME, H: process.env.FREEDOM_HOME };
  delete process.env.FREEDOM_SKILL_LEDGER_HOME;
  process.env.FREEDOM_HOME = home;
  try {
    assert.deepEqual(ledgerPaths(join(home, "no-skill-dir"), "x"), [p]);
  } finally {
    for (const [k, v] of [["FREEDOM_SKILL_LEDGER_HOME", saved.L], ["FREEDOM_HOME", saved.H]])
      if (v === undefined) delete process.env[k]; else process.env[k] = v;
  }
});
