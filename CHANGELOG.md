# Changelog

## 0.1.0 (2026-09-28)

First release of the standard ([SPEC.md](SPEC.md) v0.1.0) and its checker.

- `doctor`: scores a skill, a folder of skills, or a plugin as skill / tested / superskill, with
  the to-do list for the next level. `--level`, `--json`, `--changed`, `--base`,
  `--baseline-json`.
- `doctor --run`: runs evals with and without the skill through Claude Code or Codex and writes
  `evals/results/latest.json`. Prints an estimate and asks before spending calls.
- `init` (with `--from-session`), `miss`, `fix`, `approve`, `miss import --freedom-ledger`.
- `collection`: listing budget, cut-off descriptions, overlapping skills, the plugin line.
- `snippet`: agent-instructions block.
