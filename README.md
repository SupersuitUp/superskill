# superskill

Score any agent skill folder as **skill**, **tested**, or **superskill**, and get the exact
to-do list for the next level. Works on skills for Claude Code, Codex, or any harness that
reads the [Agent Skills](https://agentskills.io) format. Zero dependencies, Node 20 or later.

A superskill runs on frontier intelligence, is checked against examples you approved, and is
fixed every time it gets something wrong. [What that means](https://supersuit.wiki/concepts/superskill);
[the standard](SPEC.md).

## 30 seconds

```bash
npx @supersuit/superskill doctor ./my-skill
```

```
my-skill  level: skill
  /path/to/my-skill
  to reach tested:
    - evals-present: 0 eval cases (need 3)
      fix: Add real requests to evals/evals.json (`superskill init` writes an example).
    - triggers-present: trigger set has 0 should-load and 0 should-not (need 10 total, at least 3 of each)
      fix: Add realistic requests to evals/triggers.json, including near-misses that share words with the skill but need something else.

1 skill: 1 skill. target skill: met
```

Point it at a folder of skills or a plugin and it scores every one. Exit code 0 means every
skill met the target level (`--level`, default `skill`), 1 means one did not, 2 means a usage or
file error. `--json` prints one JSON document and nothing else.

## The levels

1. **skill**: a valid `SKILL.md` (name matches the folder, description of 1024 characters or
   fewer that says when to use it, hard rules above the compaction fold, headings in long bodies, nothing said twice), references one level deep, no
   hard-coded machine paths, nothing that reads like a prompt injection.
2. **tested**: at least three task evals with checks a machine can verify, and a trigger set of
   at least ten requests, some that should load the skill and some near-misses that should not.
3. **superskill**: a golden a person approved; no miss open longer than 14 days and every fixed
   miss guarded by an eval; a recent `--run` on file where the skill beats the same task done
   without it. "Recent" follows `metadata.cadence` (a weekly skill's proof lasts 30 days).

Every rule and threshold is in [SPEC.md](SPEC.md).

## Commands

| Command | What it does |
|---|---|
| `superskill doctor <path...>` | Score skills. `--level`, `--json`. |
| `superskill doctor <path> --changed [--base <ref>] [--baseline-json <file>]` | The update gate: score only skills a change touched, and refuse one whose level dropped against a previous `--json`. For CI or an agent revising a skill in a loop. |
| `superskill doctor <skill> --run [--harness claude\|codex] [--repeat 3] [--yes]` | Run the evals for real, with and without the skill, and write `evals/results/latest.json`. **The only command that spends model calls**; it prints an estimate and asks first. |
| `superskill init <skill>` | Add missing `evals/`, `goldens/`, `MISSES.md`. Never overwrites. |
| `superskill init <skill> --from-session <transcript>` | Turn the session where you did the job by hand into the first eval and a golden candidate (Claude Code `.jsonl`, or any text file as the request). |
| `superskill miss <skill> "<what happened>" [--expected "..."]` | Log a time the skill got it wrong. |
| `superskill fix <skill> <miss-id> --eval <id> [--commit <sha>]` | Close a miss. Refuses without an eval that exists. |
| `superskill approve <skill> <golden>` | A person signs off on a golden. Terminal only, asks for your name, so an agent cannot approve its own output. |
| `superskill collection <folder...> [--budget <chars>] [--overlap 0.5]` | Listing budget used, descriptions that get cut off, pairs of skills an agent could confuse (with near-miss triggers to add). |
| `superskill miss import <skill> --freedom-ledger [--ledger <file>]` | Import runs that needed correcting from Freedom's run ledger. |
| `superskill snippet` | Print a block for `AGENTS.md` / `CLAUDE.md` that teaches any agent these habits. |

Each command takes `--help`.

## The files

A superskill keeps its evidence in its own folder, so the proof moves with it:

```
my-skill/
  SKILL.md
  evals/evals.json          task evals (Anthropic skill-creator format)
  evals/triggers.json       should / should-not load (skill-creator format)
  goldens/<id>/             input.md, output.md, APPROVAL.json
  MISSES.md                 every miss, open or fixed with its eval
  evals/results/latest.json the last --run
```

Harnesses ignore folders they do not know, so none of this changes how the skill loads.

## About `--run`

- Claude Code: each run happens in a fresh folder with the skill linked at
  `.claude/skills/<name>`; the baseline runs with no skill linked and `--disable-slash-commands`.
- Codex: the skill is linked at `.agents/skills/<name>`. Codex cannot switch skills off, so a
  copy installed in `~/.agents/skills` can leak into the baseline; move it aside while proving.
- Machine checks (`contains:`, `regex:`, `file_exists:`) are free. Each plain-language expectation
  and each golden costs one grader call per run.

## Freedom

Nothing here needs [Freedom](https://getfreedom.wiki). If a skill has Freedom's `HDSOP.md`, the
doctor shows it as a bonus; `miss import --freedom-ledger` reads Freedom's run ledger as plain
files. `superskill snippet` gives any agent the same habits with no Freedom installed.

## Releasing

Bump `version` in `package.json`, add a `CHANGELOG.md` entry, commit, then
`git tag vX.Y.Z && git push origin vX.Y.Z`. `.github/workflows/publish.yml` publishes through npm
trusted publishing. Never `npm publish` from a laptop.

## License

MIT
