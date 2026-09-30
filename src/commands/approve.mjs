import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";
import { parseArgs, clock, UsageError } from "../args.mjs";
import { skillDir, refuse } from "./common.mjs";
import { readGoldens, approvalEntry, withApproval, BASES } from "../goldens.mjs";

export const help = `superskill approve <skill> <golden-id> [--rationale "<why it is right>"] [--basis judgment|outcome] [--evidence "<what happened, where to check>"]

Record that a person checked goldens/<id>/ and signs off on its output. Works only at an
interactive terminal and asks for your name, so an agent cannot approve its own output.

Every approval says WHY (--rationale, or asked) and WHAT IT RESTS ON (--basis, or asked):
  judgment  you read it and it is right (the default)
  outcome   it produced a result someone can check; --evidence is required
Approvals accumulate: two people approving, or a judgment approval later backed by an outcome,
all stay on the record. Writes goldens/<id>/APPROVAL.json with the SKILL.md hash.
`;

export async function run(argv) {
  const a = parseArgs(argv);
  if (a.flags.help) { process.stdout.write(help); return 0; }
  const dir = skillDir(a._[0], "approve");
  const id = a._[1];
  if (!id) throw new UsageError("approve needs a golden id");
  if (!(process.stdin.isTTY && process.stdout.isTTY)) return refuse("approval needs a person at a terminal. Run this yourself, not through an agent.");
  const g = readGoldens(dir).find((x) => x.id === id);
  if (!g) return refuse(`no goldens/${id}/`);
  if (g.input === null || g.output === null || !g.output.trim()) return refuse(`goldens/${id}/ needs an input file and a non-empty output file before it can be approved`);
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    process.stdout.write(`\n--- goldens/${id}/${g.outputFile} ---\n${g.output.slice(0, 2000)}${g.output.length > 2000 ? "\n[...]" : ""}\n---\n`);
    const name = (await rl.question("Your name (blank to cancel): ")).trim();
    if (!name) return refuse("not approved");
    const rationale = String(a.flags.rationale || a.flags.note || (await rl.question("Why is this right? ")).trim());
    let basis = a.flags.basis;
    if (!basis) basis = /^o/i.test((await rl.question("What does this rest on: (j)udgment, you read it and it is right, or (o)utcome, it produced a result someone can check? [j] ")).trim()) ? "outcome" : "judgment";
    const evidence = basis === "outcome" ? String(a.flags.evidence || (await rl.question("What happened, and where can someone check it? ")).trim()) : "";
    const sha = createHash("sha256").update(readFileSync(join(dir, "SKILL.md"))).digest("hex");
    const made = approvalEntry({ name, rationale, basis, evidence, at: clock(a.flags).toISOString(), sha });
    if (made.error) return refuse(made.error);
    const p = join(dir, "goldens", id, "APPROVAL.json");
    const existed = existsSync(p);
    const prior = existed ? g.approval : null;
    writeFileSync(p, JSON.stringify(withApproval(prior, made.entry), null, 2) + "\n");
    process.stdout.write(`${existed ? "added an approval to" : "approved"} goldens/${id}/ by ${name} (${basis})\n`);
    return 0;
  } finally {
    rl.close();
  }
}
