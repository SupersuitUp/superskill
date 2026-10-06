import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mkdtempSync, cpSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const FIX = join(ROOT, "test", "fixtures");
export const skill = (name) => join(FIX, "skills", name);
export const BIN = join(ROOT, "bin", "superskill.mjs");
export const NOW = new Date("2026-09-28T12:00:00Z");

// Every folder tmp() makes is removed when the test process exits. About 79 calls across the
// suites made folders and none removed them, so each run left them in the real temp folder,
// which on 2026-10-06 held 355,518 entries and froze every Claude session through the
// PeonPing hook listing it. Exit-time removal also covers a single file run on its own.
const made = [];
process.on("exit", () => {
  for (const d of made) {
    try { rmSync(d, { recursive: true, force: true }); } catch {}
  }
});

export function tmp(prefix = "superskill-") {
  const d = mkdtempSync(join(tmpdir(), prefix));
  made.push(d);
  return d;
}

/** Copy a fixture skill into a fresh temp dir so a test may mutate it. */
export function copySkill(name) {
  const dir = join(tmp(), name);
  cpSync(skill(name), dir, { recursive: true });
  return dir;
}
