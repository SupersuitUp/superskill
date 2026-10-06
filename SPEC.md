# The superskill standard

**Version 0.5.0** (2026-10-06). The reference checker is `@supersuit/superskill`; where this
document and the checker disagree, the checker has a bug.

A **superskill** runs on frontier intelligence, is checked against examples a person approved,
and is fixed every time it gets something wrong
([definition](https://supersuit.wiki/concepts/superskill)). This standard turns each clause into
a file in the skill's own folder, so the evidence travels with the skill wherever it is copied.

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
| Checked against examples you approved | At least one golden from a real run: the real input, the output the person accepted when it ran, where it came from, and a record of who approved it as a golden and when | `goldens/<id>/` (or a private folder, see below) |
| Fixed every time it gets something wrong | A miss log where every miss is open (recently) or fixed with a regression eval that would catch it again | `MISSES.md` + `evals/evals.json` |
| Runs on frontier intelligence | Its evals last passed on a current model, recently, and beat the same task run without the skill | `evals/results/latest.json` |

```
my-skill/
  SKILL.md
  references/ scripts/ ...          (as the Agent Skills spec allows)
  evals/evals.json                  task evals        (level: tested)
  evals/triggers.json               trigger evals     (level: tested)
  goldens/<id>/input.md             approved examples (level: superskill)
  goldens/<id>/output.md
  goldens/<id>/PROVENANCE.json
  goldens/<id>/APPROVAL.json
  MISSES.md                         miss log          (level: superskill)
  evals/results/latest.json         last --run        (level: superskill)
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
| `golden-approved` | fail | at least one golden **from a real run** (its `PROVENANCE.json` says `source: real-run`, names the run, and names who accepted it and when; an anonymized twin also carries `ANONYMIZED.json`) has an approval with non-empty `approved_by` and a valid `approved_at`. An approved golden without that provenance is named and does not count. Info when it was approved against an earlier `SKILL.md`; info naming the weight (judgment and outcome approvals per golden), and saying so plainly when no golden has an outcome yet |
| `real-use` | info | when the run ledger records what the person's next message made of each run (Freedom's `next_turn`), the share of those runs in the last 30 days they accepted; sandbox runs are never counted |
| `misses-log-present` | fail | `MISSES.md` exists (it may have no entries) |
| `no-stale-open-miss` | fail | no miss has been open more than 14 days |
| `fixed-miss-has-eval` | fail | every fixed miss names an eval id present in `evals.json` or `goldens/` |
| `run-evidence` | fail | `evals/results/latest.json` exists and `with_skill.pass_rate` > `without_skill.pass_rate` |
| `run-fresh` | fail / warn | the last run is younger than the cadence window: `daily` or `weekly` 30 days, `monthly` 60, `quarterly` 120, `yearly` 365, none declared 30 (info). A `yearly` skill always warns to `--run` before its next real use. An unknown cadence warns |

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

### `goldens/<id>/`

- `input.md`: the real request.
- `output.md` (or any other file that is not `input.*` or `APPROVAL.json`): the output a person
  said was right.
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

**`PROVENANCE.json` says where the example came from (0.5.0).** Only a golden from a real run
counts toward superskill. An invented input with an invented output puts "a person said this was
right" on something no person's work produced, and a skill could then reach the top level on its
author's fiction. Invented cases still belong in `evals/evals.json`, where they hold a skill at
`tested`.

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
  cannot count until someone records who accepted it.

**Private goldens.** A real run's input and output are usually about real people and should not
travel with a skill that is shared. `--private-goldens <dir>` (or `SUPERSKILL_PRIVATE_GOLDENS`)
makes `doctor`, `approve` and `doctor --run` also read `<dir>/<skill-name>/<id>/`, laid out exactly
like `goldens/<id>/`. A private golden counts for the operator who holds it. A miss is closed only
by an eval or golden that ships with the skill.

### `MISSES.md`

```markdown
# Misses

## m1 · 2026-09-20 · fixed
- What happened: A task listed twice showed up twice in the note.
- Should have: Merged duplicates into one line.
- Fix: a1b2c3d
- Eval: m1
- Source: freedom-ledger inv_2026-09-20T10-00-00Z_ab12   (optional)
```

Headings are `## <id> · <YYYY-MM-DD> · <open|fixed>`; `|` or `-` also separate. Ids are `m1`,
`m2`, ... Other headings are ignored.

### `evals/results/latest.json`

Written only by `superskill doctor --run`:

```json
{
  "run_at": "2026-09-20T10:00:00.000Z",
  "harness": "claude",
  "model": "<model id the harness reported>",
  "cases": 4,
  "repeat": 3,
  "with_skill": { "pass_rate": 1.0, "mean_ms": 21000, "mean_tokens": 4100 },
  "without_skill": { "pass_rate": 0.33, "mean_ms": 18000, "mean_tokens": 3900 },
  "per_case": [{ "id": "1", "with_skill": { "runs": 3, "passes": 3 }, "without_skill": { "runs": 3, "passes": 1 }, "failures": [] }]
}
```

A run passes when every expectation of its case passes; `pass_rate` is passing runs over runs.

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
- **`doctor --run` is never recorded as a use.** Every harness spawns its child with
  `FREEDOM_SKILL_LEDGER=off` and `SUPERSKILL_SANDBOX=1`, in a folder named `superskill-run-*`.

## Versioning

This standard is versioned with semver. Adding a rule that can fail a skill which passed before
is a minor version before 1.0 and a major version after. Thresholds are part of the standard.
