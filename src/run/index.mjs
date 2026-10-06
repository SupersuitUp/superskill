// superskill doctor --run: the only path that spends model calls. Runs every eval case
// (and every golden) N times with the skill and N times without, grades each output, and
// writes evals/results/latest.json for the run-evidence and run-fresh rules to read.
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";
import { clock, UsageError } from "../args.mjs";
import { findSkills } from "../doctor.mjs";
import { parseSkillFile } from "../frontmatter.mjs";
import { readEvals } from "../evals.mjs";
import { readGoldens } from "../goldens.mjs";
import { grade, isMachineCheck } from "./grade.mjs";
import * as claude from "./claude.mjs";
import * as codex from "./codex.mjs";
import { create as createFake } from "./fake.mjs";

export const help = `superskill doctor <skill> --run [--harness claude|codex] [--repeat 3] [--model <id>] [--yes]

Run the skill's evals for real: every case in evals/evals.json and every golden, --repeat
times with the skill and --repeat times without it, through a headless harness. Machine
checks (contains:, regex:, file_exists:) are free; each plain-language expectation costs
one grader call per run. Prints the estimated number of model calls first, and asks
before starting (or needs --yes when there is no terminal). Writes
evals/results/latest.json.

Harness: Claude Code (default when \`claude\` is on PATH) or Codex.
`;

const onPath = (bin) => spawnSync(process.platform === "win32" ? "where" : "which", [bin], { encoding: "utf8" }).status === 0;

export function pickHarness(name) {
  if (process.env.SUPERSKILL_FAKE_HARNESS) return createFake(process.env.SUPERSKILL_FAKE_HARNESS);
  const want = name || (onPath("claude") ? "claude" : onPath("codex") ? "codex" : null);
  if (want === "claude") return claude;
  if (want === "codex") return codex;
  if (!want) throw new UsageError("no harness found: install Claude Code (claude) or Codex (codex), or pass --harness");
  throw new UsageError(`unknown harness "${want}" (claude or codex)`);
}

/** Every case the run will execute: evals.json cases plus goldens judged against their approved output. */
export function collectCases(skillDir, { privateGoldens = process.env.SUPERSKILL_PRIVATE_GOLDENS || null } = {}) {
  const e = readEvals(skillDir);
  const name = parseSkillFile(readFileSync(join(skillDir, "SKILL.md"), "utf8")).data.name || "";
  if (e.error) throw new UsageError(e.error);
  const cases = e.cases.filter((c) => c.prompt.trim()).map((c) => ({ id: String(c.id), prompt: c.prompt, files: c.files, assertions: c.assertions.length ? c.assertions : [c.expected_output].filter(Boolean) }));
  for (const g of readGoldens(skillDir, { privateGoldens, name })) {
    if (!g.input || !g.output || !g.output.trim()) continue;
    cases.push({ id: `golden:${g.id}`, prompt: g.input, files: [], assertions: [`The output matches this approved output in substance (same facts, same shape; wording may differ):\n${g.output}`] });
  }
  return cases;
}

export function estimateCalls(cases, repeat) {
  const graded = cases.reduce((n, c) => n + c.assertions.filter((a) => !isMachineCheck(a)).length, 0);
  return { runs: cases.length * repeat * 2, grader: graded * repeat * 2, total: cases.length * repeat * 2 + graded * repeat * 2 };
}

export function runEvals(skillDir, { harness, repeat = 3, now = new Date(), model, log = () => {} }) {
  const skillName = parseSkillFile(readFileSync(join(skillDir, "SKILL.md"), "utf8")).data.name || "";
  const cases = collectCases(skillDir);
  const side = () => ({ runs: 0, passes: 0, ms: 0, tokens: 0, tokenRuns: 0 });
  const totals = { with_skill: side(), without_skill: side() };
  const per_case = [];
  let seenModel = model || null;
  for (const c of cases) {
    const row = { id: c.id, with_skill: { runs: 0, passes: 0 }, without_skill: { runs: 0, passes: 0 }, failures: [] };
    for (const withSkill of [true, false]) {
      const key = withSkill ? "with_skill" : "without_skill";
      for (let i = 0; i < repeat; i++) {
        log(`${c.id} ${withSkill ? "with" : "without"} skill, run ${i + 1}/${repeat}`);
        const r = harness.runCase({ skillDir, skillName, prompt: c.prompt, files: c.files, withSkill, model });
        seenModel ||= r.model;
        const verdicts = r.failed ? [{ pass: false, reason: "harness reported an error" }] : c.assertions.map((a) => ({ a, ...grade(a, { output: r.output, cwd: r.cwd, prompt: c.prompt, graderModel: model }, harness) }));
        const pass = verdicts.every((v) => v.pass);
        if (r.cwd) rmSync(r.cwd, { recursive: true, force: true });
        const t = totals[key];
        t.runs++; t.passes += pass ? 1 : 0; t.ms += r.ms || 0;
        if (Number.isFinite(r.tokens)) { t.tokens += r.tokens; t.tokenRuns++; }
        row[key].runs++; row[key].passes += pass ? 1 : 0;
        if (!pass && withSkill) row.failures.push(verdicts.filter((v) => !v.pass).map((v) => v.reason).join("; "));
      }
    }
    per_case.push(row);
  }
  const summary = (t) => ({ pass_rate: t.runs ? round(t.passes / t.runs) : 0, mean_ms: t.runs ? Math.round(t.ms / t.runs) : 0, mean_tokens: t.tokenRuns ? Math.round(t.tokens / t.tokenRuns) : null });
  const result = { run_at: now.toISOString(), harness: harness.name, model: seenModel, cases: cases.length, repeat, with_skill: summary(totals.with_skill), without_skill: summary(totals.without_skill), per_case };
  mkdirSync(join(skillDir, "evals", "results"), { recursive: true });
  writeFileSync(join(skillDir, "evals", "results", "latest.json"), JSON.stringify(result, null, 2) + "\n");
  return result;
}

const round = (x) => Math.round(x * 1000) / 1000;

export async function runCommand(a) {
  if (a.flags.help) { process.stdout.write(help); return 0; }
  if (!a._.length) throw new UsageError("doctor --run needs a skill folder");
  const repeat = a.flags.repeat === undefined ? 3 : Number(a.flags.repeat);
  if (!(Number.isInteger(repeat) && repeat > 0)) throw new UsageError("--repeat must be a positive integer");
  const harness = pickHarness(a.flags.harness);
  const dirs = a._.flatMap((p) => findSkills(p));
  if (!dirs.length) throw new UsageError(`no skills found under ${a._.join(", ")}`);
  const plan = dirs.map((d) => ({ dir: d, cases: collectCases(d) }));
  const calls = plan.reduce((n, p) => n + estimateCalls(p.cases, repeat).total, 0);
  for (const p of plan) {
    const e = estimateCalls(p.cases, repeat);
    process.stderr.write(`${p.dir}: ${p.cases.length} cases x ${repeat} x 2 = ${e.runs} runs + ${e.grader} grader calls\n`);
  }
  process.stderr.write(`estimated model calls: ${calls} through ${harness.name}\n`);
  if (!a.flags.yes) {
    if (!(process.stdin.isTTY && process.stdout.isTTY)) {
      process.stderr.write("superskill: not starting: pass --yes to spend these calls without a terminal\n");
      return 1;
    }
    const rl = createInterface({ input: process.stdin, output: process.stderr });
    const ans = (await rl.question("Start? [y/N] ")).trim().toLowerCase();
    rl.close();
    if (ans !== "y" && ans !== "yes") { process.stderr.write("not started\n"); return 1; }
  }
  const now = clock(a.flags);
  const results = [];
  for (const p of plan) {
    const r = runEvals(p.dir, { harness, repeat, now, model: a.flags.model, log: (m) => process.stderr.write(`  ${m}\n`) });
    results.push({ path: p.dir, ...r });
    if (!a.flags.json) process.stdout.write(`${p.dir}\n  with skill ${pct(r.with_skill.pass_rate)}  without ${pct(r.without_skill.pass_rate)}  (${r.cases} cases x ${repeat})\n  wrote evals/results/latest.json\n`);
  }
  if (a.flags.json) process.stdout.write(JSON.stringify({ results }, null, 2) + "\n");
  return results.every((r) => r.with_skill.pass_rate > r.without_skill.pass_rate) ? 0 : 1;
}

const pct = (x) => `${Math.round(x * 100)}%`;
