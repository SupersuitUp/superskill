// goldens/<id>/: input.md, the approved output (output.md, or any other non-input file),
// APPROVAL.json written by a person: { approvals: [{approved_by, approved_at, skill_sha,
// rationale, basis, evidence}] } (or the single-approval shape from before 0.3.0),
// PROVENANCE.json saying where the example came from (0.5.0), and, for an anonymized twin of a
// private golden, ANONYMIZED.json, the anonymizer's receipt.
//
// A golden may also live OUTSIDE the skill, in a private folder the operator keeps
// (<private>/<skill-name>/<id>/), because a real run's input and output are usually about real
// people and should not travel with a skill that is shared. The doctor reads both.
import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";

/** Files in a golden folder that describe it rather than being its input or output. */
export const META_FILES = new Set(["APPROVAL.json", "PROVENANCE.json", "ANONYMIZED.json"]);

/** Where goldens are read from: the skill's own goldens/, then the private folder for its name. */
export function goldenRoots(dir, { privateGoldens = null, name = null } = {}) {
  const roots = [{ root: join(dir, "goldens"), private: false }];
  if (privateGoldens && name) roots.push({ root: join(privateGoldens, name), private: true });
  return roots;
}

const readJsonFile = (p) => {
  if (!existsSync(p)) return { value: null, error: null };
  try { return { value: JSON.parse(readFileSync(p, "utf8")), error: null }; }
  catch (e) { return { value: null, error: e.message }; }
};

export function readGoldens(dir, opts = {}) {
  const out = [];
  for (const { root, private: priv } of goldenRoots(dir, opts)) {
    if (!existsSync(root)) continue;
    for (const id of readdirSync(root).sort()) {
      const gdir = join(root, id);
      try { if (!statSync(gdir).isDirectory()) continue; } catch { continue; }
      const files = readdirSync(gdir).filter((f) => { try { return statSync(join(gdir, f)).isFile(); } catch { return false; } });
      const inputName = files.find((f) => /^input\./i.test(f));
      const outputName = files.find((f) => /^output\./i.test(f)) || files.find((f) => f !== inputName && !META_FILES.has(f) && !f.startsWith("."));
      const appr = readJsonFile(join(gdir, "APPROVAL.json"));
      const prov = readJsonFile(join(gdir, "PROVENANCE.json"));
      const anon = readJsonFile(join(gdir, "ANONYMIZED.json"));
      const provenance = prov.value;
      out.push({
        id,
        dir: gdir,
        private: priv,
        input: inputName ? readFileSync(join(gdir, inputName), "utf8") : null,
        outputFile: outputName || null,
        output: outputName ? readFileSync(join(gdir, outputName), "utf8") : null,
        approval: appr.value,
        approvals: approvalsOf(appr.value),
        approvalError: appr.error,
        provenance,
        provenanceError: prov.error,
        anonymized: anon.value,
        origin: originOf(provenance, anon.value),
      });
    }
  }
  return out;
}

/** Where a golden's example came from. `real-run` is the only source that can reach superskill. */
export const SOURCES = ["real-run", "synthetic", "synthetic-reconstruction"];

/**
 * Is this golden a real run a person accepted, and if not, why not?
 *
 * A real run names the run it came from (a session, a commit, a ledger id, or, for an
 * anonymized twin, `derived_from`: a hash of the private original, never its content) and the
 * person who accepted the output when it happened, and when. An anonymized twin must also carry
 * the anonymizer's receipt, because "the original was accepted" and "this twin still says the
 * same thing" are different claims.
 */
export function originOf(prov, receipt = null) {
  if (!prov || typeof prov !== "object") return { real: false, why: "no PROVENANCE.json" };
  if (prov.source !== "real-run") return { real: false, why: `source is ${JSON.stringify(prov.source ?? null)}, not "real-run"` };
  const run = prov.run && typeof prov.run === "object" ? prov.run : {};
  const ref = ["session", "commit", "ledger_id"].map((k) => run[k]).concat(prov.derived_from).find((x) => typeof x === "string" && x.trim());
  if (!ref) return { real: false, why: "names no run (run.session, run.commit, run.ledger_id or derived_from)" };
  const acc = prov.accepted && typeof prov.accepted === "object" ? prov.accepted : {};
  if (!(typeof acc.by === "string" && acc.by.trim())) return { real: false, why: "names no person who accepted the run (accepted.by)" };
  if (!validDate(acc.at)) return { real: false, why: "has no valid accepted.at" };
  if (prov.anonymized === true && !(receipt && typeof receipt === "object" && receipt.fingerprint)) return { real: false, why: "is an anonymized twin with no ANONYMIZED.json receipt" };
  return { real: true, why: "" };
}

/** What an approval rests on. `judgment`: the people who approved it read it and said it is right.
 *  `outcome`: it produced a result in the world someone can check (a client landed, a call booked).
 *  Being liked and being proven are different weights, and a golden says which it carries. */
export const BASES = ["judgment", "outcome"];

const validDate = (d) => Boolean(d) && !Number.isNaN(new Date(d).getTime());

/** Every approval on a golden, normalized. Reads the 0.3.0 `{ approvals: [...] }` shape and the
 *  single-approval shape before it (its `note` becomes the rationale, its basis judgment). */
export function approvalsOf(approval) {
  if (!approval || typeof approval !== "object") return [];
  const list = Array.isArray(approval.approvals) ? approval.approvals : [approval];
  return list
    .filter((a) => a && typeof a.approved_by === "string" && a.approved_by.trim() && validDate(a.approved_at))
    .map((a) => ({
      approved_by: a.approved_by.trim(),
      approved_at: a.approved_at,
      skill_sha: a.skill_sha || null,
      rationale: String(a.rationale ?? a.note ?? "").trim(),
      basis: a.basis === "outcome" ? "outcome" : "judgment",
      evidence: String(a.evidence ?? "").trim(),
      via: String(a.via ?? "").trim(),
    }));
}

/** How much a golden's approval weighs: how many people vouched for it, and how many results it produced. */
export function weightOf(g) {
  const list = g.approvals || approvalsOf(g.approval);
  return { judgment: list.filter((a) => a.basis === "judgment").length, outcome: list.filter((a) => a.basis === "outcome").length };
}

/** A new approval, or the reason it is refused. An approval says why, and an outcome says what happened. */
export function approvalEntry({ name, rationale, basis = "judgment", evidence = "", at, sha }) {
  if (!String(name || "").trim()) return { error: "not approved: no name" };
  if (!String(rationale || "").trim()) return { error: "an approval says why the output is right; give a rationale" };
  if (!BASES.includes(basis)) return { error: `basis must be one of ${BASES.join(", ")}` };
  if (basis === "outcome" && !String(evidence || "").trim()) return { error: "an outcome approval needs evidence: what happened, and where someone can check it" };
  return { entry: { approved_by: name.trim(), approved_at: at, skill_sha: sha, rationale: rationale.trim(), basis, ...(basis === "outcome" ? { evidence: evidence.trim() } : {}) } };
}

/** The APPROVAL.json to write: every earlier approval kept, the new one appended, and the newest
 *  mirrored at the top level so a reader written before 0.3.0 still sees an approval. */
export function withApproval(existing, entry) {
  const approvals = [...approvalsOf(existing), entry];
  const { approved_by, approved_at, skill_sha, rationale } = entry;
  return { approved_by, approved_at, skill_sha, note: rationale, approvals };
}

export const isApproved = (g) => approvalsOf(g.approval).length > 0;

/** Approved AND from a real run a person accepted: the only golden that counts for superskill. */
export const isRealApproved = (g) => isApproved(g) && (g.origin || originOf(g.provenance, g.anonymized)).real;

/** The options readGoldens needs for a loaded skill: its name and the private folder, if any. */
export const goldenOpts = (ctx, opts = {}) => ({
  name: (typeof ctx.data?.name === "string" && ctx.data.name) || ctx.folderName,
  privateGoldens: opts.privateGoldens ?? ctx.privateGoldens ?? process.env.SUPERSKILL_PRIVATE_GOLDENS ?? null,
});
