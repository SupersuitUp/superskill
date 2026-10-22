// The retro (0.7.0): a superskill judges its own runs and routes the fix by ownership.
// The assertions that matter: a clean run is never nudged, taste is never a reason, each run is
// nudged once, an installed copy is never the place to edit, and an unknown owner suggests.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync, execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { BIN, tmp } from "./helpers.mjs";
import { retroReasons, decideOwner, retroContext, readsLikeCorrection } from "../src/retro.mjs";
import { locate, withPushAccess, parseRepo } from "../src/source.mjs";
import { lastTurnRuns, onStop, onPrompt, installInto, uninstallFrom } from "../src/commands/hook.mjs";

const run = (o = {}) => ({ id: "r1", skill: "demo", tool_failures: 0, interventions: [], ...o });
const cli = (args, env = {}) => spawnSync(process.execPath, [BIN, ...args], { encoding: "utf8", env: { ...process.env, ...env } });

// ---- the rule

test("a clean run owes nothing and gets no nudge", () => {
  assert.deepEqual(retroReasons(run()), []);
  assert.equal(retroContext(run()), null);
});

test("taste is never a reason; failures, corrections and a suspect next message are", () => {
  assert.deepEqual(retroReasons(run({ interventions: [{ kind: "taste" }], user_turns: 2 })), []);
  assert.match(retroReasons(run({ tool_failures: 2 }))[0], /2 tool failures/);
  assert.match(retroReasons(run({ interventions: [{ kind: "correction" }] }))[0], /1 correction/);
  assert.match(retroReasons(run({ next_turn: "correction_suspect" })).join(), /reads like a correction/);
  assert.deepEqual(retroReasons(run({ user_turns: 3 }), { spansTurns: true }), [], "a spanning run takes turns by design");
});

test("the nudge names the skill, the routing command and both halves", () => {
  const t = retroContext(run({ tool_failures: 1 }), { command: "X retro demo" });
  assert.match(t, /demo did not one-shot/);
  assert.match(t, /X retro demo/);
  assert.match(t, /you own it: .*test.*bump its version, ship/);
  assert.match(t, /you do not: suggest/);
});

test("corrections are recognized, ordinary requests are not", () => {
  assert.ok(readsLikeCorrection("no, that's wrong"));
  assert.ok(readsLikeCorrection("you forgot the cover"));
  assert.ok(!readsLikeCorrection("great, now do the next one"));
});

test("ownership: own fixes in place, push ships, no push suggests, unknown suggests", () => {
  const own = decideOwner({ kind: "own" }, "demo");
  assert.equal(own.owner, true);
  assert.match(own.steps.join(" "), /superskill miss .*superskill fix/);
  assert.match(own.steps.join(" "), /Bump its version/);

  const pushed = decideOwner({ kind: "repo", repo: "a/b", canPush: true, installedCopy: true }, "demo", { release: "ship-it" });
  assert.equal(pushed.owner, true);
  assert.match(pushed.steps.join(" "), /Never the installed copy/);
  assert.match(pushed.steps.join(" "), /through ship-it/);

  const theirs = decideOwner({ kind: "repo", repo: "a/b", canPush: false }, "demo");
  assert.equal(theirs.owner, false);
  assert.match(theirs.steps.join(" "), /Suggest the fix/);

  const unknown = decideOwner({ kind: "repo", repo: "a/b" }, "demo");
  assert.equal(unknown.owner, null, "no network means unknown, never assumed yours");
  assert.match(unknown.steps.join(" "), /Treat it as not yours/);
});

test("retro.mjs imports nothing, so a harness can vendor it byte for byte", () => {
  const src = readFileSync(new URL("../src/retro.mjs", import.meta.url), "utf8");
  assert.ok(!/^\s*import\b/m.test(src));
});

// ---- where the source lives

const skillIn = (dir) => {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "SKILL.md"), "---\nname: demo\ndescription: Use when testing the retro.\n---\n\nBody.\n");
  return dir;
};

test("a loose folder and a remote-less repo are the person's own", () => {
  assert.equal(locate(skillIn(join(tmp(), "demo"))).kind, "own");
  const repo = tmp();
  execFileSync("git", ["init", "-q", repo]);
  assert.equal(locate(skillIn(join(repo, "skills", "demo"))).kind, "own");
});

test("a repo with a GitHub origin is a repo, and gh decides push access", () => {
  const repo = tmp();
  execFileSync("git", ["init", "-q", repo]);
  execFileSync("git", ["-C", repo, "remote", "add", "origin", "git@github.com:acme/skills.git"]);
  const where = locate(skillIn(join(repo, "demo")));
  assert.deepEqual(where, { kind: "repo", repo: "acme/skills", installedCopy: false });
  assert.equal(withPushAccess({ ...where }, () => JSON.stringify({ permissions: { push: true } })).canPush, true);
  assert.equal(withPushAccess({ ...where }, () => JSON.stringify({ permissions: { pull: true } })).canPush, false);
  assert.equal(withPushAccess({ ...where }, () => { throw new Error("401"); }).canPush, null);
});

test("an installed plugin copy is traced to its repository and flagged as a copy", () => {
  const root = tmp();
  mkdirSync(join(root, ".claude-plugin"), { recursive: true });
  writeFileSync(join(root, ".claude-plugin", "plugin.json"), JSON.stringify({ name: "p", repository: "https://github.com/acme/plugin" }));
  assert.deepEqual(locate(skillIn(join(root, "skills", "demo"))), { kind: "repo", repo: "acme/plugin", installedCopy: true });
  assert.equal(parseRepo("git+https://github.com/a/b.git"), "a/b");
});

test("the CLI says you own a local skill (exit 0) and an unreadable repo is not yours (exit 1)", () => {
  const own = cli(["retro", skillIn(join(tmp(), "demo")), "--no-network"]);
  assert.equal(own.status, 0, own.stderr);
  assert.match(own.stdout, /You own it/);
  const repo = tmp();
  execFileSync("git", ["init", "-q", repo]);
  execFileSync("git", ["-C", repo, "remote", "add", "origin", "https://github.com/acme/skills"]);
  const theirs = cli(["retro", skillIn(join(repo, "demo")), "--no-network", "--json"]);
  assert.equal(theirs.status, 1);
  assert.equal(JSON.parse(theirs.stdout).owner, null);
});

// ---- the hooks

const transcript = (rows) => {
  const f = join(tmp(), "t.jsonl");
  writeFileSync(f, rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
  return f;
};
const human = (text) => ({ type: "user", message: { content: text } });
const skillCall = (id, skill) => ({ type: "assistant", message: { content: [{ type: "tool_use", id, name: "Skill", input: { skill } }] } });
const result = (id, is_error) => ({ type: "user", message: { content: [{ type: "tool_result", tool_use_id: id, is_error }] } });

test("lastTurnRuns counts failures after a skill call in the latest turn only", () => {
  const rows = [human("old"), skillCall("a", "old-skill"), result("x", true), human("go"), skillCall("b", "demo"), result("b", false), result("y", true), result("z", true)];
  assert.deepEqual(lastTurnRuns(rows), [{ id: "b", skill: "demo", tool_failures: 2 }]);
});

test("the Stop hook nudges once per run, never on re-entry, never on a clean run", () => {
  process.env.SUPERSKILL_HOME = tmp();
  const t = transcript([human("go"), skillCall("b", "demo"), result("y", true)]);
  const out = onStop({ session_id: "s", transcript_path: t });
  assert.match(out.hookSpecificOutput.additionalContext, /demo did not one-shot \(run b: 1 tool failure\)/);
  assert.equal(out.decision, undefined, "never a visible block: it would read as a hook error");
  assert.equal(onStop({ session_id: "s", transcript_path: t }), null, "once per run");
  assert.equal(onStop({ session_id: "s2", transcript_path: t, stop_hook_active: true }), null);
  const clean = transcript([human("go"), skillCall("c", "demo"), result("c", false)]);
  assert.equal(onStop({ session_id: "s", transcript_path: clean }), null);
});

test("the prompt hook nudges when the message after a skill reads like a correction", () => {
  process.env.SUPERSKILL_HOME = tmp();
  const t = transcript([human("go"), skillCall("b", "demo"), result("b", false)]);
  assert.equal(onPrompt({ session_id: "s", transcript_path: t, prompt: "thanks, next" }), null);
  const out = onPrompt({ session_id: "s", transcript_path: t, prompt: "no, you forgot the title" });
  assert.match(out.hookSpecificOutput.additionalContext, /reads like a correction/);
  assert.equal(onPrompt({ session_id: "s", transcript_path: t, prompt: "no, still wrong" }), null, "once per run");
});

test("install is idempotent and keeps other hooks; uninstall removes only ours", () => {
  const other = { hooks: { Stop: [{ hooks: [{ type: "command", command: "echo mine" }] }] }, model: "x" };
  const once = installInto(structuredClone(other), "node \"/p/bin/superskill.mjs\" hook");
  const twice = installInto(structuredClone(once), "node \"/p/bin/superskill.mjs\" hook");
  assert.deepEqual(twice, once);
  assert.equal(once.hooks.Stop.length, 2);
  assert.equal(once.hooks.UserPromptSubmit[0].hooks[0].command, "node \"/p/bin/superskill.mjs\" hook prompt");
  assert.deepEqual(uninstallFrom(structuredClone(once)), other);
  const npx = installInto({}, "npx -y @supersuit/superskill@0.7.0 hook");
  assert.equal(uninstallFrom(npx).hooks.Stop, undefined);
});

test("hook install --dry-run prints settings and writes nothing", () => {
  const f = join(tmp(), "settings.json");
  const r = cli(["hook", "install", "--settings", f, "--dry-run"]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(JSON.parse(r.stdout).hooks.Stop[0].hooks[0].command, /hook stop$/);
});

test("an installed copy with no repository is traced through its marketplace", () => {
  const plugins = tmp();
  const copy = join(plugins, "cache", "team", "cw", "1.0.0");
  mkdirSync(join(copy, ".claude-plugin"), { recursive: true });
  writeFileSync(join(copy, ".claude-plugin", "plugin.json"), JSON.stringify({ name: "cw" }));
  mkdirSync(join(plugins, "marketplaces", "team", ".claude-plugin"), { recursive: true });
  writeFileSync(join(plugins, "marketplaces", "team", ".claude-plugin", "marketplace.json"), JSON.stringify({ plugins: [{ name: "cw", source: "./" }] }));
  writeFileSync(join(plugins, "known_marketplaces.json"), JSON.stringify({ team: { source: { source: "github", repo: "acme/team-plugin" } } }));
  process.env.SUPERSKILL_PLUGINS_ROOT = plugins;
  try {
    assert.deepEqual(locate(skillIn(join(copy, "skills", "demo"))), { kind: "repo", repo: "acme/team-plugin", installedCopy: true });
    const local = tmp();
    writeFileSync(join(plugins, "known_marketplaces.json"), JSON.stringify({ team: { source: { source: "directory", path: local } } }));
    const own = locate(skillIn(join(copy, "skills", "demo")));
    assert.deepEqual(own, { kind: "own", checkout: local });
    assert.match(decideOwner(own, "demo").steps[0], new RegExp(`source folder, ${local.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}, never the installed copy`));
  } finally { delete process.env.SUPERSKILL_PLUGINS_ROOT; }
});
