import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { parseArgs, clock, UsageError } from "../args.mjs";
import { skillDir, today } from "./common.mjs";
import { readMisses, appendMisses, nextMissId } from "../misses.mjs";
import { ledgerPaths, ledgerMisses } from "../ledger.mjs";
import { parseSkillFile } from "../frontmatter.mjs";

export const help = `superskill miss import <skill> --freedom-ledger [--ledger <file.jsonl>]

Turn Freedom's automatic run record into misses: every run that needed a correction, a
rescue or a redirect, or that failed, becomes an open miss. Taste corrections and runs
already imported are skipped. Reads <skill>/invocations.jsonl and
~/.freedom/ledger/skills/*/<skill>.jsonl, or the file given with --ledger. Freedom does not
need to be installed; the ledger is read as plain files.
`;

export async function run(argv) {
  const a = parseArgs(argv, ["freedom-ledger"]);
  if (a.flags.help) { process.stdout.write(help); return 0; }
  const dir = skillDir(a._[0], "miss import");
  if (!a.flags["freedom-ledger"]) throw new UsageError("miss import needs a source: --freedom-ledger");
  const name = parseSkillFile(readFileSync(join(dir, "SKILL.md"), "utf8")).data.name || "";
  let paths;
  if (a.flags.ledger) {
    if (!existsSync(a.flags.ledger)) throw new UsageError(`ledger not found: ${a.flags.ledger}`);
    paths = [a.flags.ledger];
  } else paths = ledgerPaths(dir, name);
  if (!paths.length) { process.stdout.write(`no Freedom ledger found for ${name || dir}; nothing imported\n`); return 0; }
  const existing = readMisses(dir) || [];
  const known = new Set(existing.map((m) => (m.source || "").replace(/^freedom-ledger\s+/, "")).filter(Boolean));
  const fresh = paths.flatMap((p) => ledgerMisses(p, known, name));
  const all = [...existing];
  const entries = fresh.map((m) => {
    const e = { ...m, id: nextMissId(all), date: m.date || today(clock(a.flags)) };
    all.push(e);
    return e;
  });
  if (entries.length) appendMisses(dir, entries);
  process.stdout.write(`${entries.length} new miss${entries.length === 1 ? "" : "es"} from ${paths.length} ledger file${paths.length === 1 ? "" : "s"}${entries.length ? `: ${entries.map((e) => e.id).join(", ")}` : ""}\n`);
  return 0;
}
