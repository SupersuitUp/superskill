# Corpus report, 2026-09-28

Not shipped (package.json `files` excludes test/). Reproduce with `HOME` pointed at an empty
temp dir, which proves the checker needs nothing Freedom installs:

```bash
H=$(mktemp -d)
HOME=$H node bin/superskill.mjs doctor     <freedom-dev>/.agents/skills --json > /tmp/freedom-doctor.json
HOME=$H node bin/superskill.mjs collection <freedom-dev>/.agents/skills --json
HOME=$H node bin/superskill.mjs doctor     ~/.claude/skills --json
HOME=$H node bin/superskill.mjs collection ~/.claude/skills --json
```

The empty HOME held zero files afterwards. No crash and no rule crash on either corpus.

## freedom-dev/.agents/skills: 101 skills

| Level | Skills |
|---|---|
| none | 22 |
| skill | 79 |
| tested | 0 |
| superskill | 0 |

Failing rules, by number of skills: evals-present 101, triggers-present 101, golden-approved 101,
misses-log-present 101, run-evidence 101, body-lines 13, description-no-xml 9,
description-length 3. Warnings: body-tokens 19, long-reference-toc 8, description-has-trigger 6.

The 22 at `none` fail on body length (13 bodies over 500 lines, the largest catch-up-freeda at
2143), angle-bracket placeholders such as `<slug>` in the description (9), or descriptions over
1024 characters (3: activate-or-update-freedom, audit-my-corpus, create-or-manage-frapp).

Collection: 60,192 listing characters against the 8,000 default budget (7.5 times over). No
description exceeds Claude Code's 1,536-character cap. Overlapping pairs:
develop-with-subagents / execute-a-plan (0.55), develop-with-subagents / dispatch-parallel-agents
(0.50).

## ~/.claude/skills (symlinks resolved, top level only): 194 skills

| Level | Skills |
|---|---|
| none | 70 |
| skill | 124 |

Failing rules: the five evidence rules on all 194, no-absolute-paths 47, description-no-xml 25,
description-length 4, body-lines 4, injection-scan 3 (two apify skills that bundle
`curl ... | bash` installers and a vendored docs dump, and chatgpt-deep-research, whose body
quotes an injection phrase while warning about injection; `superskill-ignore` on that line is the
fix). Collection: 101,292 listing characters, no description over 1,536, overlaps
make-a-hyperagent-book / make-a-nof-book (0.84) and garysheng-add-inspo /
garysheng-add-shadow-inspo (0.59).

## What the run changed in the checker

Three false positives found on the real corpus, each fixed with a regression test:

- `no-absolute-paths` matched `capture/home/Library` (a fragment, not a path), `/Users/...`
  placeholders in prose, and fake paths used as test data. It now needs the path to start a
  token and name something, and skips test files.
- `long-reference-toc` warned on 86 Freedom `HDSOP.md` workflow maps, which are written for a
  person, not loaded in part by an agent. They are now skipped.
- `injection-scan` flagged inline `data:image/png;base64,` images as base64 payloads. Data URIs
  are now removed before that check.

The truncation suspicion, as a number: no skill in either corpus is cut off per entry; the
listing as a whole is 7.5 to 12.7 times the conservative 8,000-character default. Neither vendor
publishes a whole-listing budget, so whether that means skills are dropped from the listing is
not settled by this report.

## Rerun 2026-09-28 after the length rules changed

freedom-dev: 101 skills, 89 at level skill, 12 none (description-no-xml 9, description-length 3). Warnings: rules-above-the-fold 11, navigable 4, no-repeated-paragraphs 1. The 500-line failure is gone; length alone no longer fails anything.
