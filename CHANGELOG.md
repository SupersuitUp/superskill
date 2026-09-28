# Changelog

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
