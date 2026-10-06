import { parseArgs, clock, UsageError } from "../args.mjs";
import { skillDir, today } from "./common.mjs";
import { readMisses, appendMisses, nextMissId } from "../misses.mjs";

export const help = `superskill miss <skill> "<what happened>" [--expected "<what should have>"] [--quote "<what they said>"] [--date YYYY-MM-DD]
superskill miss import <skill> --freedom-ledger [--ledger <file>]

Log a time the skill got something wrong. The entry opens today (or on --date, for a story
from the past); an open miss blocks the superskill level. Close it with \`superskill fix\`.
This is also where the story behind a rule goes: SKILL.md keeps the rule and a one-line why.
`;

export async function run(argv) {
  if (argv[0] === "import") return (await import("./import.mjs")).run(argv.slice(1));
  const a = parseArgs(argv);
  if (a.flags.help) { process.stdout.write(help); return 0; }
  const dir = skillDir(a._[0], "miss");
  const what = (a._[1] || "").trim();
  if (!what) throw new UsageError('miss needs a description: superskill miss <skill> "<what happened>"');
  const misses = readMisses(dir) || [];
  const id = nextMissId(misses);
  const date = a.flags.date || today(clock(a.flags));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new UsageError("--date must be YYYY-MM-DD");
  appendMisses(dir, [{ id, date, status: "open", what, expected: a.flags.expected || "", quote: a.flags.quote || "" }]);
  process.stdout.write(`${id} logged (open). Close it with: superskill fix ${a._[0]} ${id} --eval <id>\n`);
  return 0;
}
