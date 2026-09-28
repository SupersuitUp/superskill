// Level 3, "superskill": checked against examples a person approved, fixed every time it
// got something wrong, and proven recently on a current model against the no-skill baseline.
import { createHash } from "node:crypto";
import { defineRules } from "./define.mjs";
import { readGoldens, isApproved } from "../goldens.mjs";
import { readMisses } from "../misses.mjs";
import { readEvals, readLatestRun } from "../evals.mjs";

const f = (severity, message, fix) => ({ severity, message, fix });
const DAY = 86400000;
export const OPEN_MISS_DAYS = 14;
/** How long a --run stays fresh, by metadata.cadence. */
export const FRESH_DAYS = { daily: 30, weekly: 30, monthly: 60, quarterly: 120, yearly: 365 };
const DEFAULT_FRESH = 30;

const days = (now, date) => Math.floor((now.getTime() - new Date(date).getTime()) / DAY);

export const superskillRules = defineRules([
  {
    id: "golden-approved",
    level: "superskill",
    check(ctx) {
      if (ctx.error) return [];
      const goldens = readGoldens(ctx.dir);
      const approved = goldens.filter(isApproved);
      const out = [];
      for (const g of goldens.filter((x) => x.approvalError))
        out.push(f("fail", `goldens/${g.id}/APPROVAL.json is not valid JSON`, `Re-record it with \`superskill approve . ${g.id}\`.`));
      if (!approved.length) {
        out.push(f("fail", goldens.length ? `${goldens.length} golden${goldens.length === 1 ? "" : "s"}, none approved by a person` : "no goldens", goldens.length ? "A person runs `superskill approve <skill> <golden>` at a terminal after checking the output." : "Save a real input and the output you would sign off on under goldens/<id>/, then `superskill approve`."));
        return out;
      }
      const sha = createHash("sha256").update(ctx.raw).digest("hex");
      const stale = approved.filter((g) => g.approval.skill_sha && g.approval.skill_sha !== sha).map((g) => g.id);
      if (stale.length) out.push(f("info", `golden${stale.length === 1 ? "" : "s"} ${stale.join(", ")} approved against an earlier SKILL.md`, "Re-run the golden and re-approve if the output still holds."));
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
    id: "no-stale-open-miss",
    level: "superskill",
    check(ctx, { now = new Date() } = {}) {
      if (ctx.error) return [];
      const misses = readMisses(ctx.dir) || [];
      const out = [];
      for (const m of misses.filter((x) => x.status === "open")) {
        const age = days(now, m.date);
        if (age > OPEN_MISS_DAYS) out.push(f("fail", `miss ${m.id} open ${age} days (limit ${OPEN_MISS_DAYS}): ${m.what.slice(0, 80)}`, `Fix it, add an eval that catches it, then \`superskill fix <skill> ${m.id} --eval <id>\`.`));
        else out.push(f("info", `miss ${m.id} open ${age} day${age === 1 ? "" : "s"}`, `Fix within ${OPEN_MISS_DAYS} days of ${m.date}.`));
      }
      return out;
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
      for (const g of readGoldens(ctx.dir)) ids.add(g.id);
      return misses
        .filter((m) => !m.eval || !ids.has(String(m.eval)))
        .map((m) => f("fail", m.eval ? `miss ${m.id} names eval "${m.eval}", which is not in evals.json or goldens/` : `miss ${m.id} is fixed with no regression eval`, `Add a case to evals/evals.json that would catch ${m.id} again, and name its id on the Eval line.`));
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
