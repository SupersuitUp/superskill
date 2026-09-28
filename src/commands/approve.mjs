import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";
import { parseArgs, clock, UsageError } from "../args.mjs";
import { skillDir, refuse } from "./common.mjs";
import { readGoldens } from "../goldens.mjs";

export const help = `superskill approve <skill> <golden-id> [--note "<why it is right>"]

Record that a person checked goldens/<id>/ and signs off on its output. Works only at an
interactive terminal and asks for your name, so an agent cannot approve its own output.
Writes goldens/<id>/APPROVAL.json with the SKILL.md hash it was approved against.
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
    const note = a.flags.note || (await rl.question("Why is this right? (optional): ")).trim();
    const sha = createHash("sha256").update(readFileSync(join(dir, "SKILL.md"))).digest("hex");
    const p = join(dir, "goldens", id, "APPROVAL.json");
    const existed = existsSync(p);
    writeFileSync(p, JSON.stringify({ approved_by: name, approved_at: clock(a.flags).toISOString(), skill_sha: sha, note }, null, 2) + "\n");
    process.stdout.write(`${existed ? "re-approved" : "approved"} goldens/${id}/ by ${name}\n`);
    return 0;
  } finally {
    rl.close();
  }
}
