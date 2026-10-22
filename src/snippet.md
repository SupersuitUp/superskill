## Skills (superskill)

Skills in this project are held to the superskill standard: https://supersuit.wiki/concepts/superskill

- **After doing a job by hand once, propose a skill for it.** If the person agrees, write the
  skill, then seed its evidence from this session:
  `npx @supersuit/superskill init <skill-folder> --from-session <this session's transcript>`
  The golden it creates is optional evidence and waits for the person; never approve it yourself.
- **Whenever a skill needed correcting** (the person redirected you, fixed its output, or you
  worked around it), log it before moving on:
  `npx @supersuit/superskill miss <skill-folder> "<what happened>" --expected "<what should have>"`
  When you fix it, add an eval that would catch it again and close it with
  `npx @supersuit/superskill fix <skill-folder> <miss-id> --eval <eval-id>`.
- **After any run of a skill that did not go cleanly** (a tool failed, the person corrected it),
  judge the run before moving on: what did the skill not know, or tell you wrong? If the skill is
  at fault, `npx @supersuit/superskill retro <skill-folder>` says who fixes it. If you own it (a
  skill only you have, or a repo you can push to), fix it at the source with a regression eval,
  bump its version and release it. If you do not, suggest the fix to its owner for the person to
  approve. Never edit an installed copy. `npx @supersuit/superskill hook install` makes Claude Code
  ask this at the right moment.
- **The story goes in MISSES.md, never in SKILL.md.** SKILL.md holds the rule and a one-line
  why; what happened, when, and what the person said go on the miss entry (`--quote`).
- **Before calling a skill done**, run
  `npx @supersuit/superskill doctor <skill-folder>`
  and fix everything it lists for the level the skill is meant to reach.
