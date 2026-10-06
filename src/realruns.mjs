// The real-run record (0.6.0): how often the skill did the job for a real person with no
// correction, counted separately for every model and harness it ran on.
//
// Harness-neutral on purpose. Any harness, ledger or script can write the file; the doctor only
// reads it. Format `superskill-real-runs/1`:
//
//   {
//     "format": "superskill-real-runs/1",
//     "skill": "weekly-status",
//     "generated_at": "2026-10-06T12:00:00Z",
//     "source": "freedom-skill-ledger",
//     "pairs": [
//       { "model": "claude-opus-5-5", "harness": "claude-code", "runs": 12, "one_shot": 11,
//         "first_at": "2026-09-01T09:00:00Z", "last_at": "2026-10-05T18:00:00Z" }
//     ]
//   }
//
// A run is one real use: never a sandbox run (`doctor --run`), never a test. It is one-shot when
// the person needed no correction, rescue or redirect, it did not fail or get abandoned, and it
// was not corrected after it handed back. A taste note is the person's preference, not a defect,
// and does not break one-shot.
//
// Where the doctor reads it, first found wins:
//   1. <dir>/<skill-name>.json, where <dir> is --real-runs or SUPERSKILL_REAL_RUNS (an
//      operator's own export, kept out of the skill);
//   2. <skill>/evals/real-runs.json (counts only, so it can travel with the skill);
//   3. Freedom's skill ledger, read as plain files, when neither exists.
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { ledgerPaths } from "./ledger.mjs";

export const FORMAT = "superskill-real-runs/1";
export const UNKNOWN = "unknown";
/** The defaults the real-runs rule holds a skill to. `--min-real-runs` / `--min-one-shot` change them. */
export const MIN_REAL_RUNS = 5;
export const MIN_ONE_SHOT = 0.8;

const MISS_KINDS = new Set(["redirect", "correction", "rescue"]);

/** Is this a known model+harness pair? A record that could not say proves nothing about either. */
export const knownPair = (p) => Boolean(p.model && p.harness && p.model !== UNKNOWN && p.harness !== UNKNOWN);

function normalize(doc, where) {
  if (!doc || typeof doc !== "object") return { error: `${where} is not a JSON object` };
  if (doc.format && doc.format !== FORMAT) return { error: `${where} has format ${JSON.stringify(doc.format)}, not ${FORMAT}` };
  if (!Array.isArray(doc.pairs)) return { error: `${where} has no pairs array` };
  const pairs = doc.pairs
    .filter((p) => p && typeof p === "object")
    .map((p) => ({
      model: String(p.model || UNKNOWN),
      harness: String(p.harness || UNKNOWN),
      runs: Math.max(0, Number(p.runs) || 0),
      one_shot: Math.max(0, Number(p.one_shot) || 0),
      first_at: p.first_at || null,
      last_at: p.last_at || null,
    }))
    .map((p) => ({ ...p, one_shot: Math.min(p.one_shot, p.runs) }));
  return { pairs, generated_at: doc.generated_at || null, source: doc.source || null, where };
}

function readFile(p, where) {
  try { return normalize(JSON.parse(readFileSync(p, "utf8")), where); }
  catch (e) { return { error: `${where} is not valid JSON: ${e.message}` }; }
}

/** Is a ledger record a one-shot run? Exported so a writer can count the same way the reader does. */
export function isOneShot(rec) {
  const kinds = (Array.isArray(rec?.interventions) ? rec.interventions : []).filter((i) => i && MISS_KINDS.has(i.kind));
  return !kinds.length && !["failed", "abandoned"].includes(rec?.outcome) && !rec?.corrected_after;
}

/** Summarize ledger records (Freedom's shape, or any with model/harness/started) per model+harness. */
export function pairsFromRecords(records, skillName = null) {
  const by = new Map();
  for (const rec of records) {
    if (!rec || rec.synthetic) continue;
    if (skillName && rec.skill && bare(rec.skill) !== bare(skillName)) continue;
    const model = String(rec.model || UNKNOWN), harness = String(rec.harness || UNKNOWN);
    const k = `${model}\u0000${harness}`;
    const p = by.get(k) || { model, harness, runs: 0, one_shot: 0, first_at: null, last_at: null };
    p.runs++;
    if (isOneShot(rec)) p.one_shot++;
    const t = typeof rec.started === "string" ? rec.started : null;
    if (t && (!p.first_at || t < p.first_at)) p.first_at = t;
    if (t && (!p.last_at || t > p.last_at)) p.last_at = t;
    by.set(k, p);
  }
  return [...by.values()].sort((a, b) => b.runs - a.runs || a.model.localeCompare(b.model));
}

const bare = (name) => String(name || "").split(":").pop();

function fromLedger(dir, name) {
  const paths = ledgerPaths(dir, name);
  if (!paths.length) return null;
  const recs = [];
  for (const p of paths) {
    let text = "";
    try { text = readFileSync(p, "utf8"); } catch { continue; }
    for (const line of text.split("\n")) {
      if (!line.trim()) continue;
      try { recs.push(JSON.parse(line)); } catch {}
    }
  }
  return { pairs: pairsFromRecords(recs, name), generated_at: null, source: "freedom-skill-ledger (read live)", where: "Freedom's skill ledger" };
}

/** The real-run record for one skill, or null when nothing records any. */
export function readRealRuns(dir, { name, realRunsDir = null } = {}) {
  if (realRunsDir && name) {
    const p = join(realRunsDir, `${name}.json`);
    if (existsSync(p)) return readFile(p, `${realRunsDir}/${name}.json`);
  }
  const local = join(dir, "evals", "real-runs.json");
  if (existsSync(local)) return readFile(local, "evals/real-runs.json");
  return fromLedger(dir, name);
}

/** Does any single pair clear the bar? Never pooled: each pair stands or falls on its own runs. */
export function meetsBar(pairs, { minRuns = MIN_REAL_RUNS, minOneShot = MIN_ONE_SHOT } = {}) {
  return pairs.filter(knownPair).filter((p) => p.runs >= minRuns && p.one_shot / p.runs >= minOneShot);
}
