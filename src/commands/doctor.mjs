import { parseArgs, clock, UsageError } from "../args.mjs";
import { doctor } from "../doctor.mjs";
import { formatDoctor } from "../report.mjs";
import { LEVELS } from "../levels.mjs";

export const help = `superskill doctor <path...> [options]

Score one skill, a folder of skills, or a plugin (skills/*/SKILL.md).
Levels: skill (spec-valid, hygienic) < tested (evals + triggers) < superskill
(approved golden, misses fixed with evals, a fresh --run that beats no-skill).

Options:
  --level <skill|tested|superskill>  target level for the exit code (default skill)
  --json                             print one JSON document and nothing else
  --now <iso date>                   evaluate dates as of this moment
  --help                             this text

Exit codes: 0 every skill meets the target, 1 below target, 2 usage or IO error.
`;

export async function run(argv) {
  const a = parseArgs(argv);
  if (a.flags.help) { process.stdout.write(help); return 0; }
  const level = a.flags.level || "skill";
  if (!LEVELS.includes(level)) throw new UsageError(`--level must be one of ${LEVELS.join(", ")}`);
  if (!a._.length) throw new UsageError("doctor needs a path");
  const result = doctor(a._, { level, now: clock(a.flags) });
  process.stdout.write(a.flags.json ? JSON.stringify(result, null, 2) + "\n" : formatDoctor(result));
  return result.ok ? 0 : 1;
}
