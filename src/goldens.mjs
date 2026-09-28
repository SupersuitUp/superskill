// goldens/<id>/: input.md, the approved output (output.md, or any other non-input file),
// and APPROVAL.json {approved_by, approved_at, skill_sha, note} written by a person.
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
      approvalError,
    });
  }
  return out;
}

export const isApproved = (g) => Boolean(g.approval && typeof g.approval.approved_by === "string" && g.approval.approved_by.trim() && g.approval.approved_at && !Number.isNaN(new Date(g.approval.approved_at).getTime()));
