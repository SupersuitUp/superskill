// superskill hook: the retro, wired into Claude Code so it fires without anyone remembering.
//
//   superskill hook stop      Stop hook: a skill this turn ran into tool failures -> one nudge
//   superskill hook prompt    UserPromptSubmit hook: the message after a skill ran reads like a
//                             correction -> one nudge
//   superskill hook install   add both to ~/.claude/settings.json (or --settings <file>)
//   superskill hook uninstall remove them
//
// It reads the session transcript the hook payload names, never the person's words beyond the
// one prompt it is handed, and stores nothing but which runs it has already nudged. It never fails
// a session: every error path prints nothing and exits 0.
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "../args.mjs";
import { retroContext, readsLikeCorrection } from "../retro.mjs";

export const help = `superskill hook <stop|prompt|install|uninstall> [--settings <file>] [--dry-run]

Wire the retro into Claude Code. After a skill's run hits tool failures, or the person's next
message reads like a correction, the agent is asked once to judge the run and route the fix:
the owner fixes and ships it, anyone else suggests it (see "superskill retro").

  install     add the Stop and UserPromptSubmit hooks to ~/.claude/settings.json
  uninstall   remove them
  stop        the Stop hook itself (reads the hook payload on stdin)
  prompt      the UserPromptSubmit hook itself
`;

const home = () => process.env.SUPERSKILL_HOME || join(homedir(), ".superskill");
const SEEN = () => join(home(), "retro-seen.json");

function readSeen() { try { return JSON.parse(readFileSync(SEEN(), "utf8")); } catch { return []; } }
function markSeen(key) {
  const seen = readSeen().filter((k) => k !== key);
  seen.push(key);
  mkdirSync(home(), { recursive: true });
  writeFileSync(SEEN(), JSON.stringify(seen.slice(-500)));
}

const rows = (file) => {
  try {
    return readFileSync(file, "utf8").split("\n").filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  } catch { return []; }
};
const blocks = (row) => (Array.isArray(row?.message?.content) ? row.message.content : []);
const textOf = (row) => typeof row?.message?.content === "string" ? row.message.content
  : blocks(row).filter((b) => b?.type === "text").map((b) => b.text).join("\n");
/** The harness speaking (a background task finished, a system notice), which is not the person. */
const HARNESS = [/^\s*<task-notification>/, /^\s*\[SYSTEM NOTIFICATION/, /^\s*<system-reminder>/, /^\s*Another Claude session sent a message/];
export const isHarnessPrompt = (text) => HARNESS.some((re) => re.test(String(text ?? "")));
/** A message the person typed: a user row with no tool result that the harness did not inject. */
const typed = (row) => row?.type === "user" && !row.isMeta && !row.isSidechain && !row.isCompactSummary
  && !blocks(row).some((b) => b?.type === "tool_result") && !isHarnessPrompt(textOf(row));

/** The skill runs in the turn after the person's last message: [{ id, skill, tool_failures }]. */
export function lastTurnRuns(transcript) {
  let start = -1;
  for (let i = transcript.length - 1; i >= 0; i--) if (typed(transcript[i])) { start = i; break; }
  const runs = [];
  for (const row of transcript.slice(start + 1)) {
    for (const b of blocks(row)) {
      if (row.type === "assistant" && b?.type === "tool_use" && b.name === "Skill" && b.input?.skill) {
        runs.push({ id: b.id, skill: b.input.skill, tool_failures: 0 });
      } else if (row.type === "user" && b?.type === "tool_result" && b.is_error && runs.length) {
        runs[runs.length - 1].tool_failures += 1;
      }
    }
  }
  return runs;
}

export function onStop(payload) {
  if (!payload || payload.stop_hook_active || !payload.transcript_path) return null;
  const seen = new Set(readSeen());
  const owed = lastTurnRuns(rows(payload.transcript_path))
    .filter((r) => !seen.has(`${payload.session_id}:${r.id}`))
    .map((r) => ({ r, text: retroContext(r) }))
    .filter((x) => x.text);
  if (!owed.length) return null;
  for (const { r } of owed) markSeen(`${payload.session_id}:${r.id}`);
  // additionalContext continues the turn as a note the agent reads; a block's reason would be drawn
  // to the person as "Stop hook error".
  return { hookSpecificOutput: { hookEventName: "Stop", additionalContext: owed.map((x) => x.text).join("\n\n") } };
}

export function onPrompt(payload) {
  if (!payload || !payload.transcript_path || isHarnessPrompt(payload.prompt) || !readsLikeCorrection(payload.prompt)) return null;
  const runs = lastTurnRuns(rows(payload.transcript_path));
  const run = runs[runs.length - 1];
  if (!run) return null;
  const key = `${payload.session_id}:${run.id}:next`;
  if (readSeen().includes(key)) return null;
  markSeen(key);
  const text = retroContext({ ...run, tool_failures: 0, next_turn: "correction_suspect" });
  return { hookSpecificOutput: { hookEventName: "UserPromptSubmit", additionalContext: text } };
}

/** The command a settings file should run: this install of the CLI, or npx at this version. */
export function hookCommand() {
  const bin = fileURLToPath(new URL("../../bin/superskill.mjs", import.meta.url));
  let real = bin;
  try { real = realpathSync(bin); } catch {}
  if (/[\\/]_npx[\\/]/.test(real)) {
    const { version } = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8"));
    return `npx -y @supersuit/superskill@${version} hook`;
  }
  return `node "${real}" hook`;
}

const OURS = /superskill(\.mjs"?|@[\d.]+)? hook (stop|prompt)\b/;

export function installInto(settings, command) {
  const s = settings && typeof settings === "object" ? settings : {};
  s.hooks = s.hooks || {};
  for (const [event, sub] of [["Stop", "stop"], ["UserPromptSubmit", "prompt"]]) {
    const groups = (s.hooks[event] = s.hooks[event] || []);
    const present = groups.some((g) => (g.hooks || []).some((h) => OURS.test(h.command || "")));
    if (!present) groups.push({ hooks: [{ type: "command", command: `${command} ${sub}` }] });
  }
  return s;
}

export function uninstallFrom(settings) {
  const s = settings && typeof settings === "object" ? settings : {};
  for (const event of ["Stop", "UserPromptSubmit"]) {
    if (!s.hooks?.[event]) continue;
    s.hooks[event] = s.hooks[event]
      .map((g) => ({ ...g, hooks: (g.hooks || []).filter((h) => !OURS.test(h.command || "")) }))
      .filter((g) => g.hooks.length);
    if (!s.hooks[event].length) delete s.hooks[event];
  }
  return s;
}

async function readStdin() {
  let raw = "";
  for await (const chunk of process.stdin) raw += chunk;
  return raw.trim() ? JSON.parse(raw) : null;
}

export async function run(argv) {
  const a = parseArgs(argv, ["dry-run"]);
  const sub = a._[0];
  if (a.flags.help || !sub) { process.stdout.write(help); return sub ? 0 : 2; }
  if (sub === "stop" || sub === "prompt") {
    try {
      const out = (sub === "stop" ? onStop : onPrompt)(await readStdin());
      if (out) process.stdout.write(JSON.stringify(out));
    } catch { /* a hook never breaks a session */ }
    return 0;
  }
  if (sub === "install" || sub === "uninstall") {
    const file = a.flags.settings || join(homedir(), ".claude", "settings.json");
    let settings = {};
    if (existsSync(file)) settings = JSON.parse(readFileSync(file, "utf8"));
    const next = sub === "install" ? installInto(settings, a.flags.command || hookCommand()) : uninstallFrom(settings);
    const text = JSON.stringify(next, null, 2) + "\n";
    if (a.flags["dry-run"]) { process.stdout.write(text); return 0; }
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, text);
    process.stdout.write(`${sub === "install" ? "Installed" : "Removed"} the superskill retro hooks in ${file}.\n`);
    return 0;
  }
  process.stderr.write(`superskill: unknown hook "${sub}". Run superskill hook --help.\n`);
  return 2;
}
