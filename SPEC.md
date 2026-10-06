# The superskill standard

**Version 0.6.1** (2026-10-06). The reference checker is `@supersuit/superskill`; where this
document and the checker disagree, the checker has a bug.

A **superskill** runs on frontier intelligence, is fixed every time it gets something wrong, and
does the job for real people without a correction
([definition](https://supersuit.wiki/concepts/superskill)). This standard turns each clause into
a file in the skill's own folder, so the evidence travels with the skill wherever it is copied.

**What a skill has absorbed is its embodiment, not one run of it (0.6.0).** Until 0.5.0 the top
level required a golden: one real run a person approved as the standard. A random accepted run
is not the ultimate embodiment of a skill; the misses it was fixed for, and the evals that keep
each fix fixed, are. This follows Anthropic's guidance on agent evals: build the suite from real
failures, hold regression evals near 100%, grade outcomes rather than paths, and use a reference
solution to prove a task is solvable, not as the answer to match. Goldens remain, as optional
evidence.

## Contents

- [The clauses and their evidence](#the-clauses-and-their-evidence)
- [Compatibility](#compatibility)
- [Levels and rules](#levels-and-rules)
- [File formats](#file-formats)
- [Collections and plugins](#collections-and-plugins)
- [Freedom interop](#freedom-interop)
- [Versioning](#versioning)

## The clauses and their evidence

| The clause | What proves it | Where it lives |
|---|---|---|
| A skill at all | A valid `SKILL.md` under the Agent Skills spec, plus the hygiene rules below | `SKILL.md` |
| Fixed every time it gets something wrong | A miss log where every miss is fixed, each with a regression eval that would catch it again, and the story of each fix | `MISSES.md` + `evals/evals.json` |
| Runs on frontier intelligence | Its whole suite and trigger set last passed against the current `SKILL.md`, on a current model, recently, and beat the same task run without the skill | `evals/results/latest.json` |
| Does the job for real | Enough real runs on one model+harness, enough of them one-shot (no correction) | `evals/real-runs.json` (or an operator's export, see below) |
| Optional: an example a person approved | A golden: a real input, the checklist a right answer meets, a reference output, where it came from | `goldens/<id>/` (or a private folder) |

```
my-skill/
  SKILL.md
  references/ scripts/ ...          (as the Agent Skills spec allows)
  evals/evals.json                  task evals        (level: tested)
  evals/triggers.json               trigger evals     (level: tested)
  MISSES.md                         miss log + history (level: superskill)
  evals/results/latest.json         last --run        (level: superskill)
  evals/real-runs.json              real-run record   (level: superskill)
  goldens/<id>/input.md             optional evidence
  goldens/<id>/expectations.json
  goldens/<id>/output.md
  goldens/<id>/PROVENANCE.json
  goldens/<id>/APPROVAL.json
```

## Compatibility

- **A superset of the Agent Skills spec** ([agentskills.io](https://agentskills.io)). Everything
  beyond `SKILL.md` is optional to that spec, and harnesses ignore folders they do not know, so a
  superskill loads everywhere a plain skill does.
- **`evals/evals.json` and `evals/triggers.json` use the formats of Anthropic's skill-creator**
  (`anthropics/skills`, `skills/skill-creator/references/schemas.md`, read 2026-09-28). Its tools
  read these files and this checker reads theirs. The checker writes their field names
  (`expectations`) and also accepts `assertions` on read.
- **Unknown frontmatter is ignored**, as the spec allows (for example Freedom's `spans_turns` and
  `analytics`).

## Levels and rules

A skill is at the highest level whose rules, and every lower level's rules, report no `fail`.
Below `skill` it is `none`. `warn` and `info` never block a level. The doctor lists, for each
skill, exactly which `fail`s stand between it and the next level.

A line in a bundled file containing `superskill-ignore` is skipped by `no-absolute-paths` and
`injection-scan`, for a deliberate example.

### Level 1: skill

| Rule | Severity | Threshold |
|---|---|---|
| `frontmatter-valid` | fail | `SKILL.md` exists and opens with a `---` fenced YAML block |
| `name-format` | fail | `name` is 1-64 chars, `^[a-z0-9]+(-[a-z0-9]+)*$` (so no `--`) |
| `name-matches-folder` | fail | `name` equals the folder name |
| `name-reserved-words` | fail | `name` contains neither `anthropic` nor `claude` |
| `description-length` | fail | `description` is 1-1024 characters |
| `description-has-trigger` | warn | `description` says when to use it (`when`, `trigger`, `for requests`), or `when_to_use` is set |
| `description-no-xml` | fail | no `<tag>` in `description`, placeholders like `<slug>` included (Anthropic's skill guidance forbids XML tags in the description) |
| `compatibility-length` | fail | `compatibility`, if present, is at most 500 characters |
| `metadata-string-map` | fail | `metadata`, if present, maps string keys to string values |
| `body-size` | info | reports lines and estimated tokens (characters / 4) once the body passes about 5000 tokens. Length alone is never a defect. |
| `rules-above-the-fold` | warn | in a body past about 5000 tokens, every hard rule (a shouted NEVER, ALWAYS, MUST, DO NOT, REFUSE, or a bolded **Never ...** command, outside code fences) appears in the first 5000 tokens, either there or restated there. After compaction Claude Code keeps only that much of each invoked skill. |
| `reference-says-when` | warn | every link from SKILL.md to a markdown file sits on a line that says when to read it (before, when, if, for, read ...). Step files (`steps/<step>.md`) are the recommended way to keep a long skill's detail out of the always-loaded body: they are read fresh when the step comes up, so compaction does not lose them. |
| `history-in-skill` | warn | no dated incident story in the body outside code: "Earned 2026-09-08", "(Gary, 2026-09-16: ...)", "Wilson, 2026-09-05: \*"..."\*", "on 2026-09-13 a session ...", "until 2026-09-21 the flag ...", "measured 2026-09-20", "(2026-09-30, #324)", "- 2026-09-15 (#147): ...". Matched per paragraph, since a line wrap can split a name from its date. Not flagged: a line with "e.g." or "example", a date in a code span or fence, a heading, an HTML comment (a generator's provenance stamp), "as of <date>". The story goes in `MISSES.md` (below); `SKILL.md` keeps the rule and a one-line why. There is deliberately no line-count rule (retired 2026-09-28): length alone is never a defect. |
| `navigable` | warn | a body over 300 lines has no run of more than 150 lines without a heading |
| `no-repeated-paragraphs` | warn | no paragraph of 100+ characters appears twice |
| `references-one-deep` | fail | a markdown file linked from `SKILL.md` links on to no further local file |
| `long-reference-toc` | warn | every markdown file over 100 lines (other than `SKILL.md` and Freedom's `HDSOP.md`) has a table of contents in its first 30 lines (a line matching `/contents/i`, or three or more `- [x](#anchor)` lines) |
| `no-absolute-paths` | fail | no bundled text file (outside `evals/`, `goldens/` and test files such as `tests/`, `test_*.py`, `*.test.mjs`) contains a path starting `/Users/<name>`, `/home/<name>` or `C:\<name>` |
| `injection-scan` | fail | no instruction file contains an override phrase ("ignore all previous instructions", "disregard the system prompt"), a download piped into a shell (`curl ... \| sh`), a base64-like run of 200+ characters, or an HTML comment that addresses the agent (`<!-- assistant: ...`) or pairs an action (send, read, upload, run...) with a secret or a URL |
| `workflow-map` | info | a Freedom `HDSOP.md` is present (bonus, never required) |

### Level 2: tested

| Rule | Severity | Threshold |
|---|---|---|
| `evals-present` | fail | `evals/evals.json` parses and there are at least 3 cases (each golden with an input and an output counts as one) |
| `evals-verifiable` | fail | every case in `evals.json` has a prompt and at least one expectation |
| `evals-real` | fail | no eval case and no trigger still holds a `superskill init` `REPLACE:` placeholder, no two cases share a prompt, and no two triggers share a query |
| `triggers-present` | fail | `evals/triggers.json` has at least 10 queries, at least 3 that should load the skill and at least 3 near-misses that should not |

### Level 3: superskill

| Rule | Severity | Threshold |
|---|---|---|
| `misses-log-present` | fail | `MISSES.md` exists (it may have no entries) |
| `misses-closed` | fail | no miss is open. A miss is a known way the skill fails; a skill that still fails a known way is not at the top level, however recent the miss |
| `fixed-miss-has-eval` | fail | every fixed miss names an eval id present in `evals.json` or `goldens/` |
| `evals-pass` | fail | the last `--run` was against the current `SKILL.md` (`skill_sha` equals the sha256 of `SKILL.md`); its suite passed at least the minimum share of runs with the skill (default 90%); every fixed miss's regression eval passed every run; and it ran the trigger evals and got at least the minimum share right (default 90%) |
| `run-evidence` | fail | `evals/results/latest.json` exists and `with_skill.pass_rate` > `without_skill.pass_rate` |
| `run-fresh` | fail / warn | the last run is younger than the cadence window: `daily` or `weekly` 30 days, `monthly` 60, `quarterly` 120, `yearly` 365, none declared 30 (info). A `yearly` skill always warns to `--run` before its next real use. An unknown cadence warns |
| `real-runs` | fail | a real-run record (below) in which at least one model+harness pair, on its own, has at least the minimum runs (default 5) and one-shot share (default 80%). Each pair is reported as info; **pairs are never pooled**, since a clean record on one model in one harness proves nothing about another. A pair whose model or harness is `unknown` is reported and never counts |
| `golden-approved` | info / warn | never fails. Reports each golden that is approved and from a real run (with its approval weight), names approved goldens that are not from a real run and why, names a golden with no `expectations.json`, and warns on an `APPROVAL.json` or `PROVENANCE.json` that does not parse |

**The thresholds are configurable, never by the skill itself.** A skill cannot lower its own bar,
so they are not frontmatter. `doctor` takes `--min-real-runs <n>`, `--min-one-shot <0..1>`,
`--min-pass-rate <0..1>` and `--min-trigger-rate <0..1>`, or the environment variables
`SUPERSKILL_MIN_REAL_RUNS`, `SUPERSKILL_MIN_ONE_SHOT`, `SUPERSKILL_MIN_PASS_RATE` and
`SUPERSKILL_MIN_TRIGGER_RATE`. A report scored with non-default thresholds should say so.

`metadata.cadence` in `SKILL.md` frontmatter declares how often the skill really runs:

```yaml
metadata:
  cadence: weekly
```

## File formats

### `evals/evals.json` (skill-creator)

```json
{
  "skill_name": "weekly-status",
  "evals": [
    {
      "id": 1,
      "prompt": "Here are my finished tasks: ... Write my weekly status.",
      "expected_output": "A note grouped by project",
      "files": ["evals/files/tasks.csv"],
      "expectations": ["contains:Atlas", "regex:(?i)^## ", "file_exists:out.md", "Every line is in the past tense"]
    }
  ]
}
```

`id` is an integer or a string (misses and `init --from-session` use strings like `m1`, `s1`).
`files` are paths relative to the skill, copied into the run folder. An expectation is either a
machine check or a plain-language statement:

| Form | Passes when |
|---|---|
| `contains:<text>` | the output contains `<text>` |
| `regex:<pattern>` | the output matches (multiline; a leading `(?i)` makes it case-insensitive) |
| `file_exists:<path>` | the run left `<path>` in its working folder |
| anything else | a grader call answers `{"pass": true, ...}` |

A bare array of cases is accepted on read, as is `assertions` for `expectations`.

### `evals/triggers.json` (skill-creator)

```json
[
  { "query": "write my weekly status from these tasks", "should_trigger": true },
  { "query": "write a status page for our API uptime", "should_trigger": false }
]
```

### `goldens/<id>/` (optional evidence)

**A golden is an eval whose grading is a checklist of expected behavior (0.6.0).** It is never
required for any level. Grade the outcome, not the path: the checklist says what a right answer
does, and the reference output proves the task is solvable and calibrates the grader. A golden
that exists is still held to the provenance rules below, because "a person accepted this when
it ran" is a claim that has to be true.

- `input.md`: the real request.
- `expectations.json`: an array of expectations (the same forms as `evals.json`), graded by
  `--run`. Without it, `--run` grades by likeness to the reference output.
- `output.md` (or any other file that is not `input.*` or a metadata file): the reference output.
- `APPROVAL.json`, written only by `superskill approve`: at an interactive terminal, or relayed by an agent with `--approved-by` and `--via` after the person approved with a tap (the `via` field records where):

```json
{ "approvals": [
  { "approved_by": "Ann Example", "approved_at": "2026-09-10T15:00:00.000Z", "skill_sha": "<sha256 of SKILL.md>",
    "rationale": "Exactly the shape I send my manager.", "basis": "judgment" },
  { "approved_by": "Ann Example", "approved_at": "2026-09-20T15:00:00.000Z", "skill_sha": "<sha256 of SKILL.md>",
    "rationale": "My manager adopted it as the team template.", "basis": "outcome",
    "evidence": "Sent 2026-09-19; adopted as the template in the team wiki" }
] }
```

**Every approval carries a rationale and a basis, because being liked and being proven are
different weights.** `judgment`: a person read the output and says it is right. `outcome`: the
output produced a result in the world that someone can check (a client landed, a call booked, a
template adopted), and `evidence` says what happened and where to check it. Approvals accumulate:
two people approving, and later an outcome, all stay on the record. The newest approval is also
mirrored at the top level (`approved_by`, `approved_at`, `skill_sha`, `note`), so a reader written
before 0.3.0 still sees it. A pre-0.3.0 file with a single approval reads as one `judgment`
approval whose `note` is its rationale.

A golden is also an eval: `--run` judges the skill's output for `input.md` against the approved
output.

**`PROVENANCE.json` says where the example came from (0.5.0).** Only a golden from a real run is
reported as real evidence. An invented input with an invented output puts "a person said this
was right" on something no person's work produced. Invented cases belong in `evals/evals.json`.

```json
{
  "source": "real-run",
  "run": { "session": "88696e1b-...", "ledger_id": "inv_2026-09-28T02-28-29Z_ab12", "commit": null, "at": "2026-09-28T02:28:29Z" },
  "accepted": { "by": "Ann Example", "at": "2026-09-28T03:22:51Z", "signal": "close", "evidence": "her next message after the run" }
}
```

- `source`: `real-run`, `synthetic`, or `synthetic-reconstruction`. Only `real-run` counts.
- `run`: at least one of `session`, `commit`, `ledger_id` names the run it came from.
- `accepted`: who accepted the output **when it ran** (`by`), and when (`at`). This is not the
  approval: accepting is what the person did at the time (moved on, closed, said go); approving
  is saying afterwards that this example is the standard. Both are required.
- An **anonymized twin** of a private golden says `anonymized: true` and `derived_from` (a hash of
  the original, never its path or content) in place of the run, and carries `ANONYMIZED.json`, the
  anonymizer's receipt (`checker`, `checked_at`, `counts` by kind, `fingerprint`, never the
  mapping). Without the receipt the twin does not count.
- `superskill init --from-session` writes `source: real-run` with `accepted` empty, so the golden
  is not reported as real until someone records who accepted it.

**Private goldens.** A real run's input and output are usually about real people and should not
travel with a skill that is shared. `--private-goldens <dir>` (or `SUPERSKILL_PRIVATE_GOLDENS`)
makes `doctor`, `approve` and `doctor --run` also read `<dir>/<skill-name>/<id>/`, laid out exactly
like `goldens/<id>/`. A miss is closed only by an eval or golden that ships with the skill.

### `MISSES.md`

```markdown
# Misses

## m1 · 2026-09-20 · fixed
- What happened: A task listed twice showed up twice in the note.
- Should have: Merged duplicates into one line.
- Fix: a1b2c3d
- Eval: m1
- Quote: "why is Atlas in here twice"     (optional)
- Source: freedom-ledger inv_2026-09-20T10-00-00Z_ab12   (optional)
```

Headings are `## <id> · <YYYY-MM-DD> · <open|fixed>`; `|` or `-` also separate. Ids are `m1`,
`m2`, ... Other headings are ignored. A field runs on over indented lines that follow it.

**`MISSES.md` is where a skill's history lives (0.6.0).** `SKILL.md` is instructions, loaded on
every run; the story of the incident that earned a rule is history, and Anthropic's authoring
guidance is to keep time-sensitive content out of instructions. So a story becomes a miss entry:

| Field | Holds |
|---|---|
| id, date | `m<N>`, and the date the incident happened (not the date it was written down) |
| What happened | the incident, in full: what the skill did, what it cost, what was noticed |
| Should have | what the skill should have done |
| Fix | the commit, or the rule now in `SKILL.md` that the incident earned |
| Eval | the regression eval that would catch it again. Empty until one exists, and the doctor says so (`fixed-miss-has-eval`): a story with no eval is a fix nothing guards yet |
| Quote | optional: what the person said, verbatim |
| Source | optional: where it was recorded (a ledger id, an issue) |

`SKILL.md` keeps the rule and a one-line why. `superskill miss <skill> "<what>" --date <d> --quote
"<q>"` writes one.

### `evals/results/latest.json`

Written only by `superskill doctor --run`:

```json
{
  "run_at": "2026-09-20T10:00:00.000Z",
  "harness": "claude",
  "model": "<model id the harness reported>",
  "skill_sha": "<sha256 of the SKILL.md the run proved>",
  "cases": 4,
  "repeat": 3,
  "with_skill": { "pass_rate": 1.0, "mean_ms": 21000, "mean_tokens": 4100 },
  "without_skill": { "pass_rate": 0.33, "mean_ms": 18000, "mean_tokens": 3900 },
  "per_case": [{ "id": "1", "with_skill": { "runs": 3, "passes": 3 }, "without_skill": { "runs": 3, "passes": 1 }, "failures": [] }],
  "triggers": { "cases": 12, "runs": 36, "passes": 35, "pass_rate": 0.972,
    "per_query": [{ "query": "write my weekly status", "should_trigger": true, "runs": 3, "passes": 3 }] }
}
```

A run passes when every expectation of its case passes; `pass_rate` is passing runs over runs.
A trigger run passes when the harness loaded the skill exactly when `should_trigger` says
(Claude Code: a `Skill` tool call naming it or a read of its `SKILL.md`; Codex: a read of its
`SKILL.md`). A golden with `expectations.json` is graded on that checklist; one without is graded
by likeness to its reference output.

### `evals/real-runs.json` (the real-run record)

Harness-neutral: any harness, ledger or script may write it, and the doctor only reads it.

```json
{
  "format": "superskill-real-runs/1",
  "skill": "weekly-status",
  "generated_at": "2026-10-06T12:00:00Z",
  "source": "freedom-skill-ledger",
  "pairs": [
    { "model": "claude-opus-5-5", "harness": "claude-code", "runs": 12, "one_shot": 11,
      "first_at": "2026-09-01T09:00:00Z", "last_at": "2026-10-05T18:00:00Z" }
  ]
}
```

- A **run** is one real use of the skill by a person. Never a sandbox run (`doctor --run`), never
  a test.
- It is **one-shot** when the person needed no correction, rescue or redirect, it did not fail or
  get abandoned, and it was not corrected after it handed back. A ledger outcome that already
  says the person rescued the run (Freedom's `succeeded_with_rescues`) is not one-shot either,
  whether or not the rescue was classified. A taste note is the person's preference, not the
  skill's defect, and does not break one-shot.
- `model` is the model id the harness ran (as the transcript or environment reports it);
  `harness` is `claude-code`, `codex`, or another harness's name. A writer that cannot tell
  writes `unknown`, never a guess. Counts only: the file carries no input, output or names, so it
  can ship with the skill.

**Where the doctor reads it**, first found wins: `<dir>/<skill-name>.json` where `<dir>` is
`--real-runs` or `SUPERSKILL_REAL_RUNS` (an operator's own export, kept out of the skill); then
`evals/real-runs.json` in the skill; then Freedom's skill ledger, read live (below).

## Collections and plugins

`superskill collection` measures a set of skills together:

- **Listing budget.** Each skill costs `name + ": " + description` (plus `when_to_use`) in the
  listing a harness loads every turn, with the description part cut off at 1536 characters
  (Claude Code's documented cap). The total is reported against a budget per harness: 8000
  characters for Claude Code and Codex by default. Neither vendor published a whole-listing
  figure as of 2026-09-28, so this default is deliberately conservative and `--budget` sets it.
- **Cut-off entries.** Every skill whose `description` plus `when_to_use` exceeds 1536 characters.
- **Overlap.** Pairs whose descriptions have a token Jaccard similarity of 0.5 or more after
  stopwords. Each flagged pair yields a near-miss query for each skill's `triggers.json`, so the
  fix is proven by the trigger evals rather than guessed.

A **plugin** is a folder with `.claude-plugin/plugin.json` and `skills/<name>/`. Its line reports:
a `version`; a `CHANGELOG.md` heading for that version; and files duplicated byte-for-byte across
skills (a helper to share once). A plugin is a **superplugin** when every skill in it is a
superskill and its own line has no fail.

## Freedom interop

Nothing here requires Freedom, and the checker never imports or runs it. Where Freedom's files
exist they are read as plain files:

- `HDSOP.md` beside `SKILL.md` (the workflow map) is shown as a bonus line.
- `superskill miss import <skill> --freedom-ledger` reads `<skill>/invocations.jsonl` and
  `~/.freedom/ledger/skills/<plugin>/<skill>.jsonl`. Records are
  `{id, skill, started, outcome, interventions: [{kind, note|what}], errors}`. A record with an
  intervention of kind `redirect`, `correction` or `rescue`, or with `outcome: "failed"`, becomes
  an open miss dated from `started`; `taste` interventions are skipped; the ledger id is kept on
  a `Source:` line so a record is never imported twice. A record with `synthetic: true` (a
  sandbox run) is skipped. A record corrected after it handed back (`corrected_after`, with
  `next_turn_ref`) gets a "Should have" that points at the person's correction: the session and
  the time, never their words.
- **The real-run record.** Freedom's skill ledger records, on every run, the `model` id and the
  `harness` (`claude-code`, `codex`, ...), read from the session transcript or the environment and
  `unknown` when neither says. Freedom exports it in the `superskill-real-runs/1` format above,
  one file per skill, for `--real-runs`. With no export and no `evals/real-runs.json`, the doctor
  reads the same ledger files live and counts them the same way (sandbox runs skipped).
- **`doctor --run` is never recorded as a use.** Every harness spawns its child with
  `FREEDOM_SKILL_LEDGER=off` and `SUPERSKILL_SANDBOX=1`, in a folder named `superskill-run-*`.

## Versioning

This standard is versioned with semver. Adding a rule that can fail a skill which passed before
is a minor version before 1.0 and a major version after. Thresholds are part of the standard.
