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
  // FREEDOM_SKILL_LEDGER_HOME is where Freedom itself writes when it is re-pointed (tests, a
  // second profile); read the same place it writes.
  const home = process.env.FREEDOM_SKILL_LEDGER_HOME || join(homedir(), ".freedom", "ledger");
  const root = join(home, "skills");
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
    // A sandbox run (superskill doctor --run) is a test of the skill, not a use of it.
    if (rec.synthetic) continue;
    if (skillName && rec.skill && bare(rec.skill) !== bare(skillName)) continue;
    const kinds = (Array.isArray(rec.interventions) ? rec.interventions : []).filter((i) => i && MISS_KINDS.has(i.kind));
    const failed = rec.outcome === "failed";
    if (!kinds.length && !failed) continue;
    const parts = kinds.map((i) => `${i.kind}${i.note || i.what ? `: ${i.note || i.what}` : ""}`);
    if (failed) parts.unshift(`run failed${Array.isArray(rec.errors) && rec.errors.length ? ` (${rec.errors.slice(0, 2).map((e) => (typeof e === "string" ? e : e?.kind || "error")).join("; ")})` : ""}`);
    const date = typeof rec.started === "string" && /^\d{4}-\d{2}-\d{2}/.test(rec.started) ? rec.started.slice(0, 10) : null;
    // A correction made in the operator's NEXT message is the best "should have" there is, and the
    // ledger keeps only where it is, never its words: point at it, so the fixer reads it there.
    const ref = rec.next_turn_ref && rec.session_id ? ` (the correction is the operator's message in session ${String(rec.session_id).slice(0, 8)} at ${rec.next_turn_ref.at || "?"}${Number.isFinite(rec.next_turn_ref.offset) ? `, transcript byte ${rec.next_turn_ref.offset}` : ""})` : "";
    const expected = rec.corrected_after ? `what the operator asked for instead${ref}` : "";
    out.push({ date, status: "open", what: parts.join("; ").replace(/\s+/g, " ").slice(0, 300), expected, source: `freedom-ledger ${rec.id}` });
    known.add(rec.id);
  }
  return out;
}

const bare = (name) => String(name || "").split(":").pop();

/**
 * How many runs the person accepted, from Freedom's `next_turn` verdict (the class of the first
 * message after a run handed back). Runs with no verdict are left out of both sides, so a missing
 * record can never read as an acceptance, and sandbox runs never count.
 */
export function acceptedRate(paths, { now = new Date(), days = 30 } = {}) {
  const since = now.getTime() - days * 86400000;
  let judged = 0, accepted = 0, synthetic = 0;
  for (const p of paths) {
    let text = "";
    try { text = readFileSync(p, "utf8"); } catch { continue; }
    for (const line of text.split("\n")) {
      if (!line.trim()) continue;
      let rec; try { rec = JSON.parse(line); } catch { continue; }
      const t = Date.parse(rec?.started || "");
      if (!Number.isFinite(t) || t < since || t > now.getTime()) continue;
      if (rec.synthetic) { synthetic++; continue; }
      if (!rec.next_turn || rec.next_turn === "none") continue;
      judged++;
      if (["close", "go", "new_topic"].includes(rec.next_turn) && !rec.corrected_after && !["failed", "abandoned"].includes(rec.outcome)) accepted++;
    }
  }
  return { judged, accepted, synthetic };
}
