// Codex headless. With the skill: .agents/skills/<name> symlinked into the run folder.
// Without: no skill in the folder. (A copy installed at user level can still load; Codex
// has no switch to disable skills, so keep the skill out of ~/.agents/skills when proving it.)
import { spawnSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { prepareWorkspace } from "./workspace.mjs";
import { sandboxEnv } from "./env.mjs";

export const name = "codex";

function call(prompt, cwd, model) {
  const out = join(cwd, ".superskill-last-message.txt");
  const args = ["exec", "--skip-git-repo-check", "-C", cwd, "-o", out];
  if (model) args.push("-m", model);
  args.push(prompt);
  const t0 = Date.now();
  const r = spawnSync("codex", args, { cwd, env: sandboxEnv(), encoding: "utf8", maxBuffer: 64 * 1024 * 1024, timeout: 15 * 60 * 1000 });
  if (r.error) throw Object.assign(new Error(`codex failed to start: ${r.error.message}`), { code: "SUPERSKILL" });
  const output = existsSync(out) ? readFileSync(out, "utf8") : r.stdout;
  const tok = (r.stderr + r.stdout).match(/tokens used[:\s]+([\d,]+)/i);
  return { output, ms: Date.now() - t0, tokens: tok ? Number(tok[1].replace(/,/g, "")) : null, model: model || null, failed: r.status !== 0 };
}

export function runCase({ skillDir, skillName, prompt, files, withSkill, model }) {
  const cwd = prepareWorkspace({ skillDir, skillName, files, linkAt: withSkill ? ".agents/skills" : null });
  return { ...call(prompt, cwd, model), cwd };
}

export function ask(prompt, { model } = {}) {
  const cwd = prepareWorkspace({ skillDir: null, skillName: null });
  return call(prompt, cwd, model).output;
}
