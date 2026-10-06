// Claude Code headless. With the skill: the run folder carries .claude/skills/<name> as a
// symlink. Without: the same kind of folder with no skill, and --disable-slash-commands so
// a copy installed at user level cannot leak into the baseline.
import { spawnSync } from "node:child_process";
import { prepareWorkspace } from "./workspace.mjs";
import { sandboxEnv } from "./env.mjs";

export const name = "claude";

function call(args, cwd) {
  const t0 = Date.now();
  const r = spawnSync("claude", args, { cwd, env: sandboxEnv(), encoding: "utf8", maxBuffer: 64 * 1024 * 1024, timeout: 15 * 60 * 1000 });
  const ms = Date.now() - t0;
  if (r.error) throw Object.assign(new Error(`claude failed to start: ${r.error.message}`), { code: "SUPERSKILL" });
  let doc = null;
  try { doc = JSON.parse(r.stdout); } catch {}
  if (!doc) return { output: r.stdout || r.stderr || "", ms, tokens: null, model: null, failed: r.status !== 0 };
  const u = doc.usage || {};
  const tokens = ["input_tokens", "output_tokens", "cache_creation_input_tokens", "cache_read_input_tokens"].reduce((n, k) => n + (Number(u[k]) || 0), 0) || null;
  const model = doc.modelUsage ? Object.keys(doc.modelUsage)[0] || null : doc.model || null;
  return { output: typeof doc.result === "string" ? doc.result : "", ms: doc.duration_ms || ms, tokens, model, failed: doc.is_error === true };
}

export function runCase({ skillDir, skillName, prompt, files, withSkill, model }) {
  const cwd = prepareWorkspace({ skillDir, skillName, files, linkAt: withSkill ? ".claude/skills" : null });
  const args = ["-p", prompt, "--output-format", "json", "--add-dir", cwd];
  if (!withSkill) args.push("--disable-slash-commands");
  if (model) args.push("--model", model);
  return { ...call(args, cwd), cwd };
}

export function ask(prompt, { model } = {}) {
  const cwd = prepareWorkspace({ skillDir: null, skillName: null });
  const args = ["-p", prompt, "--output-format", "json", "--disable-slash-commands"];
  if (model) args.push("--model", model);
  return call(args, cwd).output;
}
