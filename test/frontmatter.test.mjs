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
