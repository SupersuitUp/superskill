import { readFileSync } from "node:fs";
import { parseArgs, clock, UsageError } from "../args.mjs";
import { doctor, findSkills } from "../doctor.mjs";
import { formatDoctor } from "../report.mjs";
import { LEVELS } from "../levels.mjs";
import { changedFiles, touchedSkills, levelDrops } from "../changed.mjs";

export const help = `superskill doctor <path...> [options]

Score one skill, a folder of skills, or a plugin (skills/*/SKILL.md).
Levels: skill (spec-valid, hygienic) < tested (real evals + triggers) < superskill
(an approved golden from a real run a person accepted, misses fixed with evals, a fresh
--run that beats no-skill).

Options:
  --level <skill|tested|superskill>  target level for the exit code (default skill)
  --json                             print one JSON document and nothing else
  --changed                          score only skills a change touched (git): changes
                                     since --base <ref> plus the working tree
  --base <ref>                       with --changed, e.g. origin/main in CI
  --baseline-json <file>             a previous --json; exit 1 if any skill's level dropped
  --run                              run the evals with and without the skill (costs
                                     model calls; see "superskill doctor --run --help")
  --private-goldens <dir>            also read goldens from <dir>/<skill-name>/<id>/ (or set
                                     SUPERSKILL_PRIVATE_GOLDENS): real runs kept out of the skill
  --now <iso date>                   evaluate dates as of this moment
  --help                             this text

Exit codes: 0 every skill meets the target, 1 below target or a level dropped,
2 usage or IO error.
`;

export async function run(argv) {
  const a = parseArgs(argv, ["changed", "run", "yes"]);
  if (a.flags.run) return (await import("../run/index.mjs")).runCommand(a);
  if (a.flags.help) { process.stdout.write(help); return 0; }
  const level = a.flags.level || "skill";
  if (!LEVELS.includes(level)) throw new UsageError(`--level must be one of ${LEVELS.join(", ")}`);
  if (!a._.length) throw new UsageError("doctor needs a path");
  const opts = { level, now: clock(a.flags), privateGoldens: a.flags["private-goldens"] || process.env.SUPERSKILL_PRIVATE_GOLDENS || null };
  if (a.flags.changed) {
    const all = a._.flatMap((p) => findSkills(p));
    const files = a._.flatMap((p) => changedFiles(p, a.flags.base));
    opts.only = touchedSkills(all, files);
    if (!opts.only.length) {
      if (a.flags.json) process.stdout.write(JSON.stringify({ target: level, ok: true, skills: [], drops: [] }, null, 2) + "\n");
      else process.stdout.write("no changed skills\n");
      return 0;
    }
  }
  const result = doctor(a._, opts);
  if (a.flags["baseline-json"]) {
    let baseline;
    try { baseline = JSON.parse(readFileSync(a.flags["baseline-json"], "utf8")); }
    catch (e) { throw new UsageError(`cannot read --baseline-json: ${e.message}`); }
    result.drops = levelDrops(result, baseline);
    if (result.drops.length) result.ok = false;
  }
  if (a.flags.json) process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  else {
    let out = formatDoctor(result);
    for (const d of result.drops || []) out += `REFUSED: ${d.name} dropped from ${d.from} to ${d.to}\n`;
    process.stdout.write(out);
  }
  return result.ok ? 0 : 1;
}
