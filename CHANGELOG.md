# Changelog

## 0.3.0 (2026-09-29)

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
