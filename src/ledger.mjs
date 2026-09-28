// Freedom's run ledger, read as plain files. Freedom records every skill run; a run that
// needed a correction, a rescue or a redirect, or that failed, is a miss the skill owes a fix
// for. Taste corrections are the operator's preference, not the skill's defect, and are skipped.
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const MISS_KINDS = new Set(["redirect", "correction", "rescue"]);

/** Ledger files that may hold runs of this skill. */
export function ledgerPaths(skillDir, skillName) {
  const out = [];
  const local = join(skillDir, "invocations.jsonl");
  if (existsSync(local)) out.push(local);
  const root = join(homedir(), ".freedom", "ledger", "skills");
  if (existsSync(root) && skillName) {
    for (const plugin of readdirSync(root).sort()) {
      const p = join(root, plugin, `${skillName}.jsonl`);
      if (existsSync(p)) out.push(p);
    }
  }
  return out;
}

/** Misses to import from one ledger file, skipping ledger ids already in `known`. */
export function ledgerMisses(path, known, skillName) {
  const out = [];
  for (const line of readFileSync(path, "utf8").split("\n")) {
    if (!line.trim()) continue;
    let rec;
    try { rec = JSON.parse(line); } catch { continue; }
    if (!rec || !rec.id || known.has(rec.id)) continue;
    if (skillName && rec.skill && rec.skill !== skillName) continue;
    const kinds = (Array.isArray(rec.interventions) ? rec.interventions : []).filter((i) => i && MISS_KINDS.has(i.kind));
    const failed = rec.outcome === "failed";
    if (!kinds.length && !failed) continue;
    const parts = kinds.map((i) => `${i.kind}${i.note || i.what ? `: ${i.note || i.what}` : ""}`);
    if (failed) parts.unshift(`run failed${Array.isArray(rec.errors) && rec.errors.length ? ` (${rec.errors.slice(0, 2).join("; ")})` : ""}`);
    const date = typeof rec.started === "string" && /^\d{4}-\d{2}-\d{2}/.test(rec.started) ? rec.started.slice(0, 10) : null;
    out.push({ date, status: "open", what: parts.join("; ").replace(/\s+/g, " ").slice(0, 300), expected: "", source: `freedom-ledger ${rec.id}` });
    known.add(rec.id);
  }
  return out;
}
