import { parseArgs, clock, UsageError } from "../args.mjs";
import { skillDir, today } from "./common.mjs";
import { readMisses, appendMisses, nextMissId } from "../misses.mjs";

export const help = `superskill miss <skill> "<what happened>" [--expected "<what should have>"]
superskill miss import <skill> --freedom-ledger [--ledger <file>]

Log a time the skill got something wrong. The entry opens today; an open miss older than
14 days blocks the superskill level. Close it with \`superskill fix\`.
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
  appendMisses(dir, [{ id, date: today(clock(a.flags)), status: "open", what, expected: a.flags.expected || "" }]);
  process.stdout.write(`${id} logged (open). Close it with: superskill fix ${a._[0]} ${id} --eval <id>\n`);
  return 0;
}
