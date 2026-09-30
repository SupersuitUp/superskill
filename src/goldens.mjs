// goldens/<id>/: input.md, the approved output (output.md, or any other non-input file),
// and APPROVAL.json written by a person: { approvals: [{approved_by, approved_at, skill_sha,
// rationale, basis, evidence}] }, or the single-approval shape from before 0.3.0.
import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";

export function readGoldens(dir) {
  const root = join(dir, "goldens");
  if (!existsSync(root)) return [];
  const out = [];
  for (const id of readdirSync(root).sort()) {
    const gdir = join(root, id);
    try { if (!statSync(gdir).isDirectory()) continue; } catch { continue; }
    const files = readdirSync(gdir);
    const inputName = files.find((f) => /^input\./i.test(f));
    const outputName = files.find((f) => /^output\./i.test(f)) || files.find((f) => f !== inputName && f !== "APPROVAL.json" && !f.startsWith("."));
    let approval = null, approvalError = null;
    if (files.includes("APPROVAL.json")) {
      try { approval = JSON.parse(readFileSync(join(gdir, "APPROVAL.json"), "utf8")); }
      catch (e) { approvalError = e.message; }
    }
    out.push({
      id,
      dir: gdir,
      input: inputName ? readFileSync(join(gdir, inputName), "utf8") : null,
      outputFile: outputName || null,
      output: outputName ? readFileSync(join(gdir, outputName), "utf8") : null,
      approval,
      approvals: approvalsOf(approval),
      approvalError,
    });
  }
  return out;
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
