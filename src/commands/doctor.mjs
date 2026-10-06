import { readFileSync } from "node:fs";
import { parseArgs, clock, UsageError } from "../args.mjs";
import { doctor, findSkills } from "../doctor.mjs";
import { formatDoctor } from "../report.mjs";
import { LEVELS } from "../levels.mjs";
import { changedFiles, touchedSkills, levelDrops } from "../changed.mjs";

export const help = `superskill doctor <path...> [options]

Score one skill, a folder of skills, or a plugin (skills/*/SKILL.md).
Levels: skill (spec-valid, hygienic) < tested (real evals + triggers) < superskill
(every miss fixed with a regression eval; the suite and triggers pass against this SKILL.md
in a fresh --run that beats no-skill; and a real-run record: at least 5 real runs, 80%
one-shot, on one model+harness). Goldens are optional evidence.

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
  --real-runs <dir>                  read the real-run record from <dir>/<skill-name>.json (or
                                     set SUPERSKILL_REAL_RUNS); else evals/real-runs.json, else
                                     Freedom's skill ledger
  --min-real-runs <n>                real runs one model+harness needs (default 5)
  --min-one-shot <0..1>              one-shot share that pair needs (default 0.8)
  --min-pass-rate <0..1>             suite pass rate the last --run needs (default 0.9)
  --min-trigger-rate <0..1>          trigger evals right in the last --run (default 0.9)
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
  const opts = { level, now: clock(a.flags), privateGoldens: a.flags["private-goldens"] || process.env.SUPERSKILL_PRIVATE_GOLDENS || null, ...thresholds(a.flags) };
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

/** The superskill bar's thresholds, from flags then environment. Unset means the documented default. */
export function thresholds(flags, env = process.env) {
  const pick = (flag, envName, lo, hi) => {
    const raw = flags[flag] ?? env[envName];
    if (raw === undefined || raw === "") return undefined;
    const n = Number(raw);
    if (!Number.isFinite(n) || n < lo || (hi !== null && n > hi)) throw new UsageError(`--${flag} must be a number${hi === null ? ` of at least ${lo}` : ` from ${lo} to ${hi}`}`);
    return n;
  };
  return {
    realRuns: flags["real-runs"] || env.SUPERSKILL_REAL_RUNS || null,
    minRealRuns: pick("min-real-runs", "SUPERSKILL_MIN_REAL_RUNS", 1, null),
    minOneShot: pick("min-one-shot", "SUPERSKILL_MIN_ONE_SHOT", 0, 1),
    minPassRate: pick("min-pass-rate", "SUPERSKILL_MIN_PASS_RATE", 0, 1),
    minTriggerRate: pick("min-trigger-rate", "SUPERSKILL_MIN_TRIGGER_RATE", 0, 1),
  };
}
