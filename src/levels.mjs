export const LEVELS = ["skill", "tested", "superskill"];

/** Next level up from a reached level, or null at the top. */
export function nextLevel(level) {
  if (level === "none") return "skill";
  const i = LEVELS.indexOf(level);
  return i >= 0 && i < LEVELS.length - 1 ? LEVELS[i + 1] : null;
}

/** True when `reached` is at or above `target`. */
export function meets(reached, target) {
  return reached !== "none" && LEVELS.indexOf(reached) >= LEVELS.indexOf(target);
}

/** A level is reached when it and every level below it have no `fail` finding. */
export function computeLevel(findings) {
  let reached = "none";
  for (const level of LEVELS) {
    if (findings.some((f) => f.level === level && f.severity === "fail")) break;
    reached = level;
  }
  return reached;
}

/** Run rules against a context, tagging every finding with the rule's id and level. */
export function runRules(ctx, rules, opts = {}) {
  const out = [];
  for (const r of rules) {
    let found;
    try {
      found = r.check(ctx, opts) || [];
    } catch (e) {
      found = [{ severity: "fail", message: `rule crashed: ${e.message}`, fix: "Report this as a superskill bug." }];
    }
    for (const f of found) out.push({ ...f, rule: f.rule || r.id, level: r.level });
  }
  return out;
}
