# Changelog

## 0.6.0 (2026-10-06)

**A skill's embodiment is what it has absorbed, not one run of it.** 0.5.0 made a golden from a
real run the top-level requirement. Its first real test reversed it: nine harvested candidates,
each a real accepted run, and none was the standard the skill should be held to. The tests and
fixes a skill has absorbed are. **Breaking for anyone at superskill today:** the top level now
needs a real-run record and a 0.6.0 `--run` (one that records its `skill_sha` and the triggers).

- **Superskill is now** every miss closed with a regression eval (`misses-closed`, which replaces
  `no-stale-open-miss`: an open miss fails however recent it is), and `evals-pass`: the last
  `--run` was against the current `SKILL.md`, the suite passed (default 90% of runs), every fixed
  miss's regression eval passed every run, and the trigger evals were right (default 90%).
  `run-evidence` and `run-fresh` stand.
- **`real-runs`:** a real-run record where one model+harness pair, alone, has at least 5 real runs
  at 80% one-shot (no correction). Every pair is reported; pairs are never pooled, and a pair that
  says `unknown` never counts. The record is a harness-neutral file, `superskill-real-runs/1`, read
  from `--real-runs <dir>` / `SUPERSKILL_REAL_RUNS`, then `evals/real-runs.json`, then Freedom's
  skill ledger live. It replaces `real-use`.
- **Configurable bar:** `--min-real-runs`, `--min-one-shot`, `--min-pass-rate`,
  `--min-trigger-rate` (and `SUPERSKILL_MIN_*`). Never frontmatter: a skill cannot lower its own bar.
- **Goldens are optional evidence.** `golden-approved` never fails. A golden is an eval graded on
  `goldens/<id>/expectations.json`, a checklist of expected behavior (grade outcomes, not paths);
  `output.md` is the reference that proves the task solvable. Provenance rules still say which
  goldens are real runs.
- **`doctor --run` runs the trigger evals** (did the harness load the skill exactly when it
  should) and writes `skill_sha` and `triggers` into `latest.json`.
- **`history-in-skill` (warn, level skill):** a dated incident story in `SKILL.md` ("Earned
  2026-09-08", "(Gary, 2026-09-16: ...)", "on 2026-09-13 a session ...") belongs in `MISSES.md`,
  which now holds a story's full entry: id, date, what happened, fix, eval, optional `Quote:`, with
  indented continuation lines. Tuned on Freedom's 103 shipped skills. Still no line-count rule.
- `superskill miss` takes `--quote` and `--date`.
- Tests: 17 new; each guard broken on purpose and seen red (a stale-sha pass counting, pooled pairs
  counting, an unknown pair counting, an open miss passing, a half-passing regression eval passing,
  examples and provenance stamps flagged as history).

## 0.5.0 (2026-10-06)

**Superskill needs a golden from a real run.** Before, any golden a person approved counted, so a
skill could reach the top level on examples its author invented. (Gary Sheng, on five invented
goldens written to lift Freedom's flagship skills: *"I'm just concerned about hallucination that
we're accepting just to get higher doctor ratings."*) **Breaking for anyone at superskill today:**
an approved golden without the new `PROVENANCE.json` no longer counts, and the doctor says which
golden and why.

- `goldens/<id>/PROVENANCE.json`: `source` (`real-run`, `synthetic`, `synthetic-reconstruction`),
  the `run` it came from (session, commit or ledger id), and who `accepted` the output when it ran,
  and when. Only `real-run` with all of that counts for `golden-approved`. An anonymized twin of a
  private golden counts with `derived_from` and the anonymizer's `ANONYMIZED.json` receipt.
- **Private goldens.** `--private-goldens <dir>` (or `SUPERSKILL_PRIVATE_GOLDENS`) on `doctor`,
  `approve` and `doctor --run` also reads `<dir>/<skill-name>/<id>/`, for real runs too personal
  to ship with the skill. `approve` writes the approval beside the golden it found.
- `init --from-session` writes a `real-run` provenance with `accepted` left empty, so the golden
  counts only once someone records who accepted it.
- **`evals-real` (tested):** a `superskill init` `REPLACE:` placeholder, or the same prompt or
  trigger query twice, is not a case. Measured in Freedom on 2026-10-05: the init scaffold copied up
  to 3 evals and 10 triggers scored `tested` while testing nothing.
- **`doctor --run` is never recorded as a real use.** Every harness spawns its child with
  `FREEDOM_SKILL_LEDGER=off` and `SUPERSKILL_SANDBOX=1`. Measured 2026-10-05: three sandbox runs
  landed in Freedom's skill ledger as perfect one-shot runs of a skill nobody had used.
- **`real-use` (info):** where the run ledger records what the person's next message made of each
  run, the doctor prints how many of the last 30 days' judged runs they accepted, beside the level.
- `miss import --freedom-ledger` skips sandbox records, matches `freedom:<skill>` records, and
  points a correction's "Should have" at the person's next message (session and time, never text).
  It reads `FREEDOM_SKILL_LEDGER_HOME` when Freedom's ledger was re-pointed.
- Tests: 11 new; each guard broken on purpose and seen red (invented golden reaching superskill,
  placeholders counting, duplicate prompts counting, a sandbox run becoming a miss, a twin with no
  receipt counting, the ledger off switch missing from the run env, codex spawned without it).

## 0.4.0 (2026-09-29)

**Approve from your phone.** `superskill approve` worked only at an interactive terminal, so an
operator who reviews on a phone had to find a laptop to say yes. (Gary Sheng: *"The best way for
me to approve it is to click yes, approve, not you telling me to go to my terminal. I'm normally
mobile first."*) Away from a terminal it now accepts `--approved-by "<the person>"` and
`--via "<where they said yes>"`, after that person approved with a tap on a board or a review page.
Both are required and both are recorded (`via` on the approval), so an approval an agent relayed is
always distinguishable from one typed at a terminal, and an agent still cannot approve with no
named person and no channel. A rationale is required either way.

- Tests: refused with no name, refused with a name and no channel, refused with no rationale;
  recorded with person, channel and basis. The channel requirement was mutated out and went red.

## 0.3.1 (2026-09-29)

The 0.3.0 changes below, released. The v0.3.0 tag's publish refused on a red test (SPEC.md still
named 0.2.2), so nothing was published under 0.3.0.

## 0.3.0 (2026-09-29, not published)

**A golden's approval says why, and what it rests on.** Before, an approval recorded who and when,
with an optional note, so "a person approved it" read the same whether they liked it or it had
landed a client. (Gary Sheng, on essays he and his co-founder had approved: *"golden approval also
needs to carry rationale and weight. Right now the approval is based on Wilson and Gary being happy,
not proven results of landing clients."*)

- `superskill approve` now requires a rationale and asks for a basis: `judgment` (you read it and it
  is right, the default) or `outcome` (it produced a result someone can check; `--evidence` is
  required). New flags `--rationale` (`--note` still works), `--basis`, `--evidence`.
- Approvals accumulate in `APPROVAL.json` under `approvals`, so two people approving, and a later
  outcome, are all kept. The newest is mirrored at the top level for older readers; a pre-0.3.0 file
  reads as one judgment approval.
- `doctor` reports each golden's weight (`g1: 2 judgment, 1 outcome`) and says plainly when every
  approval is judgment only. Informational: the level still needs one approved golden, since many
  skills have no measurable outcome.
- Tests: rationale and evidence refusals, legacy normalization, accumulation, and the doctor's
  judgment-only finding appearing and clearing. Both new guards were mutated and went red.

## 0.2.2 (2026-09-29)

- An inline flow map (`scope: { form: essay, audience: builders, purpose: persuade }`, `check: {
  station: every segment carries a label }`) now reads as an object instead of the whole `{ ...
  }` coming back as a string. Nested inline maps and inline lists inside inline maps work too
  (`speech: { uses: [a, b], never: [c] }`).
- An inline flow list followed by a same-line comment (`conditions: [r1, r2, r3]   # 5 to 10
  ids`) now reads as a list. Before this, the inline-list check required the raw value to END in
  `]`, and a trailing comment broke that, so the whole line came back as a string.
- Both are read by a quote-aware character scanner rather than a naive split, so a comma,
  bracket, brace or hash inside a quoted value inside a flow collection stays text
  (`{ note: "a, b] } # c" }`). Malformed flow syntax (unbalanced brackets) still never throws: it
  falls back to the raw string, same as an unrecognized value always has.
- A block list item that is itself a bare inline flow map or list (`- { station: fine, severity:
  fail }`, `- [a, b]`) now reads as an object or a list. Before this, the KEY regex that decides
  whether `- key: value` opens a block submap matched on the first colon inside the braces
  (reading `"{ station"` as the key), so the item came back as `{ "{ station": "fine, severity:
  fail }" }`. `- key: { ... }` still opens a block submap as before.

## 0.2.1 (2026-09-28)

- An unquoted value that is only a comment now reads as empty, which is what YAML means. Before
  this, `source: # TODO` came back as the string "# TODO" and a list item written as `- # none
  yet` came back as "# none yet", so a downstream linter counted a comment placeholder as a
  filled-in field and passed specs it should have failed. A comment-only value followed by a
  more-indented block still opens that nested map or list, exactly as it did with no comment.
  Quoted values are untouched: `key: "# literal"` still reads as "# literal".

## 0.2.0 (2026-09-28)

- The frontmatter reader reads nesting: maps inside maps, lists of maps, lists inside maps, and
  block scalars at any depth. Until now it stopped at one level and silently ignored anything
  deeper, so a list of maps came back empty. Values still stay strings, and no skill in two real
  corpora (295 skills) changed level. It is exported as `parseYamlSubset` so other standards in
  this family (hyperspecification first) read their files with this one reader instead of a
  second copy.
- `metadata-string-map` now names a metadata value that is itself a map; before, the reader
  dropped it and the rule never saw it.

## 0.1.0 (2026-09-28)

- `reference-says-when`: a link from SKILL.md to an instruction file must say when to read it. Long-skill fixes now point at step files (`steps/<step>.md`).

- Length is not a defect. The 500-line `body-lines` failure and the `body-tokens` warning are replaced by `body-size` (info), `rules-above-the-fold`, `navigable` and `no-repeated-paragraphs`, which check what goes wrong in a long skill rather than its length.

First release of the standard ([SPEC.md](SPEC.md) v0.1.0) and its checker.

- `doctor`: scores a skill, a folder of skills, or a plugin as skill / tested / superskill, with
  the to-do list for the next level. `--level`, `--json`, `--changed`, `--base`,
  `--baseline-json`.
- `doctor --run`: runs evals with and without the skill through Claude Code or Codex and writes
  `evals/results/latest.json`. Prints an estimate and asks before spending calls.
- `init` (with `--from-session`), `miss`, `fix`, `approve`, `miss import --freedom-ledger`.
- `collection`: listing budget, cut-off descriptions, overlapping skills, the plugin line.
- `snippet`: agent-instructions block.
