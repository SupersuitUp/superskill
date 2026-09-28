import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mkdtempSync, cpSync } from "node:fs";
import { tmpdir } from "node:os";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const FIX = join(ROOT, "test", "fixtures");
export const skill = (name) => join(FIX, "skills", name);
export const BIN = join(ROOT, "bin", "superskill.mjs");
export const NOW = new Date("2026-09-28T12:00:00Z");

export function tmp(prefix = "superskill-") {
  return mkdtempSync(join(tmpdir(), prefix));
}

/** Copy a fixture skill into a fresh temp dir so a test may mutate it. */
export function copySkill(name) {
  const dir = join(tmp(), name);
  cpSync(skill(name), dir, { recursive: true });
  return dir;
}
