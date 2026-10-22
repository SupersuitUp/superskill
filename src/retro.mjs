// The retro: what a superskill does at the end of a run that did not one-shot.
//
// A superskill judges how its run went and improves itself. This file is the whole rule, as pure
// functions with no imports, so a harness can vendor it byte for byte (Freedom does, and a test
// there holds the copy to this file's hash):
//
//   retroReasons(run)   why a run owes a retro; [] for a clean run, which owes nothing
//   decideOwner(where)  who fixes it: the owner fixes, tests, bumps and ships; anyone else suggests
//   retroContext(run)   the nudge an agent reads at the end of such a run
//
// The refusals are the design. A clean run is never nudged (a nudge after every run is one the
// agent learns to skim). Taste is never a reason (choosing a cover is not a defect). A run that
// spans turns by design is not charged for them. An unknown owner takes the non-owner path, because
// a suggestion can be declined and a push to someone else's repo cannot be taken back. And "the
// cause was outside the skill" is a complete answer.

/**
 * A run, in the shape the real-run record and Freedom's ledger share:
 * { id, skill, tool_failures, errors[], interventions[{kind}], user_turns, next_turn, outcome }.
 * Only the fields present are read.
 */
export function retroReasons(run, { spansTurns = false } = {}) {
  if (!run) return [];
  const reasons = [];
  const failures = (run.errors && run.errors.length) || run.tool_failures || 0;
  if (failures) reasons.push(`${failures} tool failure${failures === 1 ? "" : "s"}`);
  const interventions = run.interventions || [];
  const scored = interventions.filter((i) => i && i.kind !== "taste");
  if (scored.length) {
    reasons.push(`${scored.length} correction${scored.length === 1 ? "" : "s"} (${scored.map((i) => i.kind).join(", ")})`);
  } else if (!spansTurns && !interventions.length && run.user_turns) {
    // Classifying replaces the raw count: a turn named taste is gone.
    reasons.push(`${run.user_turns} turn${run.user_turns === 1 ? "" : "s"} from the person mid-run`);
  }
  if (run.next_turn === "correction_suspect") reasons.push("the person's next message reads like a correction");
  if (run.outcome === "failed") reasons.push("the run was marked failed");
  return reasons;
}

/** The message after a hand-back that reads like a correction. A pattern match, no model call. */
export const CORRECTION_CUES = [
  /^\s*(no|nope|nah|wrong|stop|wait|hold on|undo|revert)\b/i,
  /\b(that'?s|this is|it'?s|you'?re) (not|wrong)\b/i,
  /\b(isn'?t|aren'?t|wasn'?t|doesn'?t|don'?t|didn'?t|won'?t|shouldn'?t) (right|work|look|seem|match|need|want|have|do|say)/i,
  /\byou (forgot|missed|skipped|ignored|broke|didn'?t|should(n'?t)? have|were supposed)\b/i,
  /\b(should have|should'?ve|supposed to|instead of|not what i)\b/i,
  /\b(fix|redo|re-do|try again|wrong|mistake|incorrect|broken|missing)\b/i,
];
export const readsLikeCorrection = (text) => CORRECTION_CUES.some((re) => re.test(String(text || "")));

/**
 * Who fixes the skill. `where` says what is known about its source:
 *   { kind: "own" }                                   a skill only this person has (a local folder, a repo of theirs with no remote)
 *   { kind: "repo", repo, canPush: true|false|null, installedCopy }   a skill whose source is a repo
 *   { kind: "unknown", say }
 * `how` lets a harness name its own verbs: { fixWith, release, suggestWith }.
 * Returns { owner: true|false|null, why, steps[] }.
 */
export function decideOwner(where = {}, skill = "the skill", how = {}) {
  const fixWith = how.fixWith ? ` through ${how.fixWith}` : "";
  const suggest = how.suggestWith || `an issue on the skill's repo, drafted for the person to approve before it is posted`;
  if (where.kind === "own") {
    return {
      owner: true,
      why: `${skill} is this person's own skill`,
      steps: [
        `Fix the instruction that sent the run wrong, ${where.checkout ? `in its source folder, ${where.checkout}, never the installed copy` : "in place"}${fixWith}. Correct the rule; never add a note about this run.`,
        `Log the miss and guard it: superskill miss <folder> "<what went wrong>", an eval in evals/evals.json that fails without the fix, then superskill fix <folder> <miss-id> --eval <id>.`,
        `Bump its version (metadata.version in the frontmatter if it carries one) and commit. The commit is the new version the next run is measured against.`,
      ],
    };
  }
  if (where.kind === "repo" && where.canPush === true) {
    return {
      owner: true,
      why: `this person can push to ${where.repo}, which ships ${skill}`,
      steps: [
        `Fix it at the SOURCE, ${where.checkout ? where.checkout + ", the checkout of " + where.repo : "a checkout of " + where.repo}${fixWith}.${where.installedCopy !== false ? " Never the installed copy, which the next update overwrites." : ""}`,
        `Write the regression test or eval first and see it fail, then the fix. Log and close the miss (superskill miss / superskill fix).`,
        `Bump the version and release it${how.release ? ` through ${how.release}` : " the way that repo releases"}, so everyone running the skill gets the fix.`,
      ],
    };
  }
  if (where.kind === "repo" && where.canPush === false) {
    return {
      owner: false,
      why: `${where.repo} ships ${skill} and this person cannot push to it`,
      steps: [
        `Suggest the fix to its owner: ${suggest}. Include the defect, how to reproduce it, and the change you would make.`,
        `Never work around the skill in silence, and never edit the installed copy.`,
      ],
    };
  }
  return {
    owner: null,
    why: where.say || `could not tell who owns ${skill}`,
    steps: [`Treat it as not yours: suggest the fix to its owner (${suggest}), or ask the person where the skill comes from.`],
  };
}

/** The nudge: why this run owes a retro, the evaluation, and the command that routes the fix. */
export function retroContext(run, { command, spansTurns = false } = {}) {
  const reasons = retroReasons(run, { spansTurns });
  if (!reasons.length) return null;
  const route = command || `npx @supersuit/superskill retro <${run.skill}'s folder>`;
  return [
    `Superskill retro: ${run.skill} did not one-shot (${run.id ? `run ${run.id}: ` : ""}${reasons.join("; ")}).`,
    `Before moving on, evaluate the run: what did the skill not know, or tell you wrong, that made this happen? ` +
      `If the cause was outside the skill (the network, the person changing their mind, taste), say so in one line and carry on.`,
    `If the skill is at fault, find out who owns it and do what that says:`,
    `  ${route}`,
    `  - you own it: fix it at its source with a test that fails without the fix, bump its version, ship it.`,
    `  - you do not: suggest the fix to its owner, for the person to approve.`,
    `Do it now, not "later": the next run is a different session that will not know this one happened.`,
  ].join("\n");
}
