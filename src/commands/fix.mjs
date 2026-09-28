import { parseArgs, UsageError } from "../args.mjs";
import { skillDir, refuse } from "./common.mjs";
import { readMisses, updateMiss } from "../misses.mjs";
import { readEvals } from "../evals.mjs";
import { readGoldens } from "../goldens.mjs";

export const help = `superskill fix <skill> <miss-id> --eval <eval-id> [--commit <sha>]

Close a miss. Refuses unless the named eval exists in evals/evals.json or goldens/, so
every fix leaves behind a check that would catch the same miss again.
`;

export async function run(argv) {
  const a = parseArgs(argv);
  if (a.flags.help) { process.stdout.write(help); return 0; }
  const dir = skillDir(a._[0], "fix");
  const id = (a._[1] || "").toLowerCase();
  if (!id) throw new UsageError("fix needs a miss id");
  const evalId = a.flags.eval;
  if (!evalId || evalId === true) throw new UsageError("fix needs --eval <id>: the regression eval that would catch this miss again");
  const miss = (readMisses(dir) || []).find((m) => m.id === id);
  if (!miss) return refuse(`no miss ${id} in MISSES.md`);
  const ids = new Set(readEvals(dir).cases.map((c) => String(c.id)));
  for (const g of readGoldens(dir)) ids.add(g.id);
  if (!ids.has(String(evalId))) return refuse(`eval "${evalId}" is not in evals/evals.json or goldens/. Add the case first, then fix.`);
  updateMiss(dir, id, { status: "fixed", eval: String(evalId), fix: a.flags.commit || miss.fix || "" });
  process.stdout.write(`${id} fixed, guarded by eval ${evalId}\n`);
  return 0;
}
