import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSkillFile } from "../src/frontmatter.mjs";

test("plain scalars and body", () => {
  const r = parseSkillFile("---\nname: demo\nversion: 3\n---\n# Title\nBody\n");
  assert.equal(r.error, undefined);
  assert.equal(r.data.name, "demo");
  assert.equal(r.data.version, "3");
  assert.equal(r.body, "# Title\nBody\n");
  assert.equal(r.bodyStartLine, 5);
});

test("quoted strings may contain colons and hashes", () => {
  const r = parseSkillFile(`---\nname: "a: b # c"\ndescription: 'it''s: fine'\n---\n`);
  assert.equal(r.data.name, "a: b # c");
  assert.equal(r.data.description, "it's: fine");
});

test("unquoted scalar keeps inner colons, drops trailing comment", () => {
  const r = parseSkillFile("---\ndescription: Use when X: do Y # note\n---\n");
  assert.equal(r.data.description, "Use when X: do Y");
});

test("folded > block joins lines with spaces", () => {
  const r = parseSkillFile("---\ndescription: >\n  first line\n  second line\nname: x\n---\n");
  assert.equal(r.data.description, "first line second line");
  assert.equal(r.data.name, "x");
});

test("literal | block keeps newlines", () => {
  const r = parseSkillFile("---\ndescription: |\n  one\n  two\n---\n");
  assert.equal(r.data.description, "one\ntwo");
});

test("one-level metadata map", () => {
  const r = parseSkillFile("---\nmetadata:\n  cadence: weekly\n  author: \"Ann\"\n---\n");
  assert.deepEqual(r.data.metadata, { cadence: "weekly", author: "Ann" });
});

test("inline and block lists", () => {
  const r = parseSkillFile("---\nallowed-tools: [Read, \"Bash\"]\ntags:\n  - a\n  - b\n---\n");
  assert.deepEqual(r.data["allowed-tools"], ["Read", "Bash"]);
  assert.deepEqual(r.data.tags, ["a", "b"]);
});

test("booleans stay as their literal text for later rules", () => {
  const r = parseSkillFile("---\nspans_turns: true\n---\n");
  assert.equal(r.data.spans_turns, "true");
});

test("missing frontmatter is an error", () => {
  assert.equal(parseSkillFile("# no frontmatter\n").error, "no frontmatter");
});

test("unterminated frontmatter is an error", () => {
  assert.equal(parseSkillFile("---\nname: x\nbody\n").error, "unterminated frontmatter");
});

test("CRLF input parses", () => {
  const r = parseSkillFile("---\r\nname: demo\r\n---\r\nhi\r\n");
  assert.equal(r.data.name, "demo");
});

// ── Nesting (0.2.0) ──
// The reader stopped at one level, so a list of maps (a spec's decisions, each with its own
// fields) or a map inside a map came back empty or flattened, silently. A second, deeper parser
// was about to be written beside this one; the reader grew instead, so there is one.
import { parseYamlSubset } from "../src/frontmatter.mjs";
const y = (s) => parseYamlSubset(s.replace(/^\n/, "").split("\n"));

test("a list of maps, each item carrying several keys", () => {
  assert.deepEqual(y(`
decisions:
  - id: audience
    state: decided
    value: "the operator, on a phone"
  - id: length
    state: open
`), { decisions: [
    { id: "audience", state: "decided", value: "the operator, on a phone" },
    { id: "length", state: "open" },
  ] });
});

test("a list may sit at the same indent as its key, as YAML allows", () => {
  assert.deepEqual(y(`
rejects:
- hype
- jargon
`), { rejects: ["hype", "jargon"] });
});

test("maps nest to any depth, and a map inside a list item works", () => {
  assert.deepEqual(y(`
requirements:
  - id: r1
    check:
      station: term-check
      severity: fail
resume:
  next_action: write the outline
`), {
    requirements: [{ id: "r1", check: { station: "term-check", severity: "fail" } }],
    resume: { next_action: "write the outline" },
  });
});

test("a block scalar inside a list item keeps its lines", () => {
  assert.deepEqual(y(`
examples:
  - path: goldens/a.md
    why: |
      the opening lands in one line
      and the second line earns it
`), { examples: [{ path: "goldens/a.md", why: "the opening lands in one line\nand the second line earns it" }] });
});

test("an inline list inside a nested map, and comments at any depth", () => {
  assert.deepEqual(y(`
feedback:
  # where adopters push back
  issues: https://example.com/issues
  tags: [spec, writing]
`), { feedback: { issues: "https://example.com/issues", tags: ["spec", "writing"] } });
});

test("a list of plain scalars nested inside a map", () => {
  assert.deepEqual(y(`
audience:
  knows:
    - git
    - markdown
`), { audience: { knows: ["git", "markdown"] } });
});

// The reader is a public entry point, so the standards built on superskill import THIS one
// rather than copying it. Resolved by package name, the way an adopter would.
test("the reader is importable as @supersuit/superskill/yaml", async () => {
  const mod = await import("@supersuit/superskill/yaml");
  assert.equal(typeof mod.parseYamlSubset, "function");
  assert.equal(typeof mod.parseSkillFile, "function");
});

// ── Comment-only values (0.2.1) ──
// An unquoted value that is only a YAML comment means the same as no value at all. Before this,
// `source: # TODO` came back as the string "# TODO" and `- # none yet` came back as "# none yet",
// so a downstream linter counted a placeholder comment as a filled-in field.

test("an unquoted value that is only a comment reads as empty", () => {
  assert.deepEqual(y(`
source: # TODO
`), { source: "" });
});

test("a comment after the colon does not block a nested block from being read", () => {
  assert.deepEqual(y(`
metadata: # see below
  cadence: weekly
  author: Ann
`), { metadata: { cadence: "weekly", author: "Ann" } });
});

test("a list item that is only a comment reads as empty", () => {
  assert.deepEqual(y(`
notes:
  - # none yet
  - real note
`), { notes: ["", "real note"] });
});

test("a quoted value that looks like a comment is untouched", () => {
  assert.deepEqual(y(`
a: "# literal"
b: '# x'
`), { a: "# literal", b: "# x" });
});

test("a trailing comment is still stripped, and a bare hash with no space is still part of the value", () => {
  assert.deepEqual(y(`
c: value # trailing comment
d: a#b
`), { c: "value", d: "a#b" });
});
