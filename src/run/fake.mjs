// A stand-in harness for tests: SUPERSKILL_FAKE_HARNESS names a node script that reads one
// JSON request on stdin ({mode: "case"|"ask"|"trigger", prompt|query, withSkill, cwd}) and
// prints {output, tokens?, model?} (or {triggered} for a trigger). Never calls a model.
import { spawnSync } from "node:child_process";
import { prepareWorkspace } from "./workspace.mjs";
import { sandboxEnv } from "./env.mjs";

export const name = "fake";

function call(script, req) {
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [script], { input: JSON.stringify(req), env: sandboxEnv(), encoding: "utf8" });
  if (r.status !== 0) throw Object.assign(new Error(`fake harness failed: ${r.stderr}`), { code: "SUPERSKILL" });
  const doc = JSON.parse(r.stdout);
  return { output: doc.output ?? "", tokens: doc.tokens ?? null, model: doc.model ?? "fake", ms: Date.now() - t0, failed: false };
}

export function create(script) {
  return {
    name,
    runCase({ skillDir, skillName, prompt, files, withSkill }) {
      const cwd = prepareWorkspace({ skillDir, skillName, files, linkAt: withSkill ? ".claude/skills" : null });
      return { ...call(script, { mode: "case", prompt, withSkill, cwd }), cwd };
    },
    triggerCase({ skillDir, skillName, query }) {
      const cwd = prepareWorkspace({ skillDir, skillName, linkAt: ".claude/skills" });
      const doc = JSON.parse(spawnSync(process.execPath, [script], { input: JSON.stringify({ mode: "trigger", query, cwd }), env: sandboxEnv(), encoding: "utf8" }).stdout || "{}");
      return { triggered: Boolean(doc.triggered), failed: false, cwd };
    },
    ask(prompt) {
      return call(script, { mode: "ask", prompt }).output;
    },
  };
}
