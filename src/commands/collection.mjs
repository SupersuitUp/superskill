import { parseArgs, UsageError } from "../args.mjs";
import { collection, ENTRY_CAP } from "../collection.mjs";

export const help = `superskill collection <folder...> [--budget <chars>] [--overlap <0-1>] [--json]

Check a set of skills together:
  - listing budget: characters of "name: description" the harness loads every turn,
    against claude-code and codex budgets (8000 each by default; --budget overrides)
  - cut-off entries: skills whose entry exceeds ${ENTRY_CAP} characters
  - overlap: pairs whose descriptions share enough words (--overlap, default 0.5) that an
    agent could load the wrong one, each with a near-miss trigger to add to the other
  - plugin line (when the folder has .claude-plugin/plugin.json): version, changelog
    entry, helpers copied between skills

Exit codes: 0 within budget and nothing cut off, 1 otherwise, 2 usage or IO error.
`;

export async function run(argv) {
  const a = parseArgs(argv);
  if (a.flags.help) { process.stdout.write(help); return 0; }
  if (!a._.length) throw new UsageError("collection needs a folder");
  const opts = {};
  if (a.flags.budget !== undefined) { opts.budget = Number(a.flags.budget); if (!(opts.budget > 0)) throw new UsageError("--budget must be a positive number"); }
  if (a.flags.overlap !== undefined) { opts.overlap = Number(a.flags.overlap); if (!(opts.overlap > 0 && opts.overlap <= 1)) throw new UsageError("--overlap must be between 0 and 1"); }
  const r = collection(a._, opts);
  if (a.flags.json) { process.stdout.write(JSON.stringify(r, null, 2) + "\n"); return r.ok ? 0 : 1; }
  const L = [];
  L.push(`${r.skills.length} skills, ${r.total_chars} listing characters`);
  for (const b of r.budgets) L.push(`  ${b.harness.padEnd(12)} ${b.used} / ${b.limit}${b.over ? `  OVER by ${b.over}` : "  ok"}`);
  if (r.truncated.length) {
    L.push(`cut off (entry over ${ENTRY_CAP} characters):`);
    for (const t of r.truncated) L.push(`  ${t.name}: ${t.chars} characters, ${t.cut} not shown`);
  }
  const top = [...r.skills].sort((x, y) => y.chars - x.chars).slice(0, 5);
  L.push("largest entries:");
  for (const s of top) L.push(`  ${String(s.chars).padStart(5)}  ${s.name}`);
  if (r.overlaps.length) {
    L.push(`overlapping descriptions (${r.overlaps.length}):`);
    for (const o of r.overlaps.slice(0, 25)) {
      L.push(`  ${o.score.toFixed(2)}  ${o.a} <> ${o.b}`);
      for (const s of o.suggest) L.push(`        add to ${s.skill}/evals/triggers.json: ${JSON.stringify(s.trigger)}`);
    }
    if (r.overlaps.length > 25) L.push(`  ... ${r.overlaps.length - 25} more (--json for all)`);
  } else L.push("no overlapping descriptions");
  if (r.plugin) L.push(...pluginLines(r.plugin));
  process.stdout.write(L.join("\n") + "\n");
  return r.ok ? 0 : 1;
}

export function pluginLines(p, superplugin) {
  const L = [`plugin ${p.name || "(unnamed)"} ${p.version || "(no version)"}${superplugin === undefined ? "" : superplugin ? "  superplugin" : ""}`];
  for (const f of p.findings) L.push(`  ${f.severity.padEnd(4)}  ${f.rule}: ${f.message}${f.severity === "info" ? "" : `\n        fix: ${f.fix}`}`);
  return L;
}
