// Level 3, "superskill" (0.6.0): fixed every time it got something wrong, with a regression eval
// for each fix; its whole suite and trigger set pass against the SKILL.md that is here now, on a
// current model and better than no skill; and it did the job for real people, one-shot, often
// enough on at least one model+harness. Goldens are optional evidence.
import { createHash } from "node:crypto";
import { defineRules } from "./define.mjs";
import { readGoldens, isApproved, isRealApproved, weightOf, goldenOpts } from "../goldens.mjs";
import { readRealRuns, meetsBar, knownPair, MIN_REAL_RUNS, MIN_ONE_SHOT } from "../realruns.mjs";
import { readMisses } from "../misses.mjs";
import { readEvals, readLatestRun } from "../evals.mjs";

const f = (severity, message, fix) => ({ severity, message, fix });
const DAY = 86400000;
/** Defaults for evals-pass; `--min-pass-rate` / `--min-trigger-rate` change them. */
export const MIN_PASS_RATE = 0.9;
export const MIN_TRIGGER_RATE = 0.9;
/** How long a --run stays fresh, by metadata.cadence. */
export const FRESH_DAYS = { daily: 30, weekly: 30, monthly: 60, quarterly: 120, yearly: 365 };
const DEFAULT_FRESH = 30;

const days = (now, date) => Math.floor((now.getTime() - new Date(date).getTime()) / DAY);

export const superskillRules = defineRules([
  {
    // 0.6.0: a golden is optional evidence, never the bar. A random accepted run is not the
    // embodiment of a skill; the misses it absorbed and the evals that hold them are. A golden
    // that exists is still an eval (its checklist is graded by --run), so its files are checked.
    id: "golden-approved",
    level: "superskill",
    check(ctx, opts = {}) {
      if (ctx.error) return [];
      const goldens = readGoldens(ctx.dir, goldenOpts(ctx, opts));
      if (!goldens.length) return [];
      const out = [];
      const where = (g) => (g.private ? `private golden ${g.id}` : `goldens/${g.id}`);
      for (const g of goldens.filter((x) => x.approvalError))
        out.push(f("warn", `${where(g)}/APPROVAL.json is not valid JSON`, `Re-record it with \`superskill approve . ${g.id}\`.`));
      for (const g of goldens.filter((x) => x.provenanceError))
        out.push(f("warn", `${where(g)}/PROVENANCE.json is not valid JSON`, "Rewrite it: source, run, accepted (see SPEC.md, goldens)."));
      for (const g of goldens.filter((x) => !x.expectations.length))
        out.push(f("info", `${where(g)} has no expectations.json, so --run grades it by likeness to output.md`, "Write goldens/<id>/expectations.json: the behaviors a right answer shows (grade the outcome, not the path). output.md then stays as the reference that proves the task is solvable."));
      const approved = goldens.filter(isApproved);
      const real = goldens.filter(isRealApproved);
      const unreal = approved.filter((g) => !real.includes(g));
      if (unreal.length) out.push(f("info", `approved golden${unreal.length === 1 ? "" : "s"} not from a real run a person accepted: ${unreal.map((g) => `${g.id} ${g.origin.why}`).join("; ")}`, "Only a golden whose PROVENANCE.json names a real run and who accepted it is evidence of real use; an invented one is an ordinary eval."));
      if (!real.length) return out;
      const sha = createHash("sha256").update(ctx.raw).digest("hex");
      const stale = real.filter((g) => g.approval.skill_sha && g.approval.skill_sha !== sha).map((g) => g.id);
      if (stale.length) out.push(f("info", `golden${stale.length === 1 ? "" : "s"} ${stale.join(", ")} approved against an earlier SKILL.md`, "Re-run the golden and re-approve if the output still holds."));
      const w = real.map((g) => ({ id: g.id, ...weightOf(g) }));
      out.push(f("info", `real goldens (optional evidence): ${w.map((x) => `${x.id}: ${x.judgment} judgment, ${x.outcome} outcome`).join("; ")}`, ""));
      return out;
    },
  },
  {
    // The record from real use, per model and harness. A clean record on one model in one harness
    // proves nothing about another, so pairs are never pooled: one pair has to clear the bar alone.
    id: "real-runs",
    level: "superskill",
    check(ctx, opts = {}) {
      if (ctx.error) return [];
      const name = (typeof ctx.data?.name === "string" && ctx.data.name) || ctx.folderName;
      const minRuns = num(opts.minRealRuns, MIN_REAL_RUNS), minOneShot = num(opts.minOneShot, MIN_ONE_SHOT);
      const bar = `at least ${minRuns} real runs and ${pct(minOneShot)} one-shot on one model+harness`;
      const realRunsDir = opts.realRuns ?? ctx.realRuns ?? process.env.SUPERSKILL_REAL_RUNS ?? null;
      const rec = readRealRuns(ctx.dir, { name, realRunsDir });
      const how = "Export the run record (format superskill-real-runs/1, SPEC.md) to evals/real-runs.json or --real-runs <dir>; Freedom's skill ledger exports it.";
      if (!rec) return [f("fail", `no real-run record (needs ${bar})`, how)];
      if (rec.error) return [f("fail", rec.error, how)];
      const out = rec.pairs.map((p) => f("info", `real runs, ${p.model} / ${p.harness}: ${p.one_shot} of ${p.runs} one-shot${p.runs ? ` (${pct(p.one_shot / p.runs)})` : ""}${knownPair(p) ? "" : ", not counted: the record does not say which model or harness"}`, ""));
      if (!meetsBar(rec.pairs, { minRuns, minOneShot }).length) {
        const best = rec.pairs.filter(knownPair)[0];
        out.push(f("fail", `real-run record below the bar (${bar}; ${rec.where})${best ? `: best is ${best.model} / ${best.harness}, ${best.one_shot} of ${best.runs}` : ": no run names its model and harness"}`, "Use the skill for real and fix what it gets wrong; every correction is a miss to close with an eval."));
      }
      return out;
    },
  },
  {
    id: "misses-log-present",
    level: "superskill",
    check(ctx) {
      if (ctx.error) return [];
      return readMisses(ctx.dir) === null ? [f("fail", "no MISSES.md", "Run `superskill init` to add one; log each correction with `superskill miss`.")] : [];
    },
  },
  {
    // 0.6.0: every miss is closed. An open miss is a known way the skill fails today, and a skill
    // that still fails a known way is not at the top level, however recent the miss is.
    id: "misses-closed",
    level: "superskill",
    check(ctx, { now = new Date() } = {}) {
      if (ctx.error) return [];
      const misses = readMisses(ctx.dir) || [];
      return misses.filter((x) => x.status === "open").map((m) => {
        const age = days(now, m.date);
        return f("fail", `miss ${m.id} is open (${age} day${age === 1 ? "" : "s"}): ${m.what.slice(0, 80)}`, `Fix it, add an eval that catches it, then \`superskill fix <skill> ${m.id} --eval <id>\`.`);
      });
    },
  },
  {
    id: "fixed-miss-has-eval",
    level: "superskill",
    check(ctx) {
      if (ctx.error) return [];
      const misses = (readMisses(ctx.dir) || []).filter((m) => m.status === "fixed");
      if (!misses.length) return [];
      const ids = new Set(readEvals(ctx.dir).cases.map((c) => String(c.id)));
      // Shipped goldens only: a miss is closed by a check that travels with the skill.
      for (const g of readGoldens(ctx.dir)) ids.add(g.id);
      return misses
        .filter((m) => !m.eval || !ids.has(String(m.eval)))
        .map((m) => f("fail", m.eval ? `miss ${m.id} names eval "${m.eval}", which is not in evals.json or goldens/` : `miss ${m.id} is fixed with no regression eval`, `Add a case to evals/evals.json that would catch ${m.id} again, and name its id on the Eval line.`));
    },
  },
  {
    // The suite and the trigger set pass against the SKILL.md that is here now. A pass recorded
    // against an earlier SKILL.md proves the earlier skill.
    id: "evals-pass",
    level: "superskill",
    check(ctx, opts = {}) {
      if (ctx.error) return [];
      const r = readLatestRun(ctx.dir);
      if (!r.run) return [];
      const run = r.run;
      const out = [];
      const sha = createHash("sha256").update(ctx.raw).digest("hex");
      if (!run.skill_sha) out.push(f("fail", "latest.json does not say which SKILL.md it ran against (no skill_sha)", "Re-run `superskill doctor <skill> --run` with superskill 0.6.0 or later."));
      else if (run.skill_sha !== sha) out.push(f("fail", "the last --run was against an earlier SKILL.md", "Re-run `superskill doctor <skill> --run`; a change to the skill needs its evals re-run."));
      const minPass = num(opts.minPassRate, MIN_PASS_RATE), minTrig = num(opts.minTriggerRate, MIN_TRIGGER_RATE);
      const w = Number(run.with_skill?.pass_rate);
      if (Number.isFinite(w) && w < minPass) out.push(f("fail", `the suite passed ${pct(w)} of runs with the skill (needs ${pct(minPass)})`, "Read the failures in latest.json per_case, fix the skill, re-run."));
      // Every fixed miss's regression eval passes every run: a regression that comes back half the
      // time has come back.
      const fixed = (readMisses(ctx.dir) || []).filter((m) => m.status === "fixed" && m.eval);
      const cases = new Map((Array.isArray(run.per_case) ? run.per_case : []).map((c) => [String(c.id), c]));
      for (const m of fixed) {
        const c = cases.get(String(m.eval)) || cases.get(`golden:${m.eval}`);
        if (!c) { if (run.skill_sha) out.push(f("fail", `regression eval ${m.eval} (miss ${m.id}) is not in the last --run`, "Re-run `superskill doctor <skill> --run`.")); continue; }
        const ws = c.with_skill || {};
        if (!(ws.runs > 0 && ws.passes === ws.runs)) out.push(f("fail", `regression eval ${m.eval} (miss ${m.id}) passed ${ws.passes || 0} of ${ws.runs || 0} runs`, `Miss ${m.id} is back: fix the skill until its eval passes every run.`));
      }
      const t = run.triggers;
      if (!t || !Number.isFinite(Number(t.pass_rate))) out.push(f("fail", "the last --run did not run the trigger evals", "Re-run `superskill doctor <skill> --run` with superskill 0.6.0 or later; it runs evals/triggers.json too."));
      else if (Number(t.pass_rate) < minTrig) out.push(f("fail", `trigger evals ${pct(Number(t.pass_rate))} right (needs ${pct(minTrig)})`, "Read triggers.per_query in latest.json: sharpen the description so it loads when it should and not otherwise."));
      return out;
    },
  },
  {
    id: "run-evidence",
    level: "superskill",
    check(ctx) {
      if (ctx.error) return [];
      const r = readLatestRun(ctx.dir);
      if (r.missing) return [f("fail", "no evals/results/latest.json", "Run `superskill doctor <skill> --run` to run the evals with and without the skill.")];
      if (r.error) return [f("fail", r.error, "Re-run `superskill doctor --run`.")];
      const w = Number(r.run?.with_skill?.pass_rate), wo = Number(r.run?.without_skill?.pass_rate);
      if (!Number.isFinite(w) || !Number.isFinite(wo)) return [f("fail", "latest.json has no with_skill / without_skill pass rates", "Re-run `superskill doctor --run`.")];
      if (!(w > wo)) return [f("fail", `with the skill ${pct(w)} vs without ${pct(wo)}: the skill does not beat the baseline`, "Improve the skill (or its evals) until it clearly beats running the task without it.")];
      return [];
    },
  },
  {
    id: "run-fresh",
    level: "superskill",
    check(ctx, { now = new Date() } = {}) {
      if (ctx.error) return [];
      const r = readLatestRun(ctx.dir);
      if (!r.run) return [];
      const at = r.run.run_at;
      if (!at || Number.isNaN(new Date(at).getTime())) return [f("fail", "latest.json has no valid run_at", "Re-run `superskill doctor --run`.")];
      const meta = ctx.data.metadata && typeof ctx.data.metadata === "object" ? ctx.data.metadata : {};
      const cadence = String(meta.cadence || "").toLowerCase();
      const out = [];
      if (cadence && !(cadence in FRESH_DAYS)) out.push(f("warn", `unknown metadata.cadence "${cadence}"`, `Use one of ${Object.keys(FRESH_DAYS).join(", ")}.`));
      if (!cadence) out.push(f("info", "no metadata.cadence; treating the proof as fresh for 30 days", "Declare how often the skill runs: metadata.cadence: daily|weekly|monthly|quarterly|yearly."));
      const limit = FRESH_DAYS[cadence] ?? DEFAULT_FRESH;
      const age = days(now, at);
      if (age > limit) out.push(f("fail", `last --run was ${age} days ago (fresh for ${limit} at ${cadence || "default"} cadence)`, "Run `superskill doctor <skill> --run` again."));
      else if (cadence === "yearly") out.push(f("warn", `yearly skill: last --run ${age} days ago`, "Run `superskill doctor <skill> --run` before its next real use; a once-a-year skill is otherwise only tested the day it is needed."));
      return out;
    },
  },
]);

const pct = (x) => `${Math.round(x * 100)}%`;
const num = (v, d) => (v === undefined || v === null || v === "" || !Number.isFinite(Number(v)) ? d : Number(v));
