// Read the first request and the final answer out of a session record, so the job done
// by hand once becomes a skill's first eval and first golden candidate.
import { readFileSync } from "node:fs";

const textOf = (content) => {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.filter((b) => b && b.type === "text" && typeof b.text === "string").map((b) => b.text).join("\n");
};

/**
 * Claude Code .jsonl: prompt = first user message whose content is text (not a tool result),
 * output = the last assistant message that carries text. Any other file: whole file = prompt.
 */
export function readSession(path) {
  const raw = readFileSync(path, "utf8");
  if (!/\.jsonl$/i.test(path)) return { prompt: raw.trim(), output: "" };
  let prompt = "", output = "";
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    let rec;
    try { rec = JSON.parse(line); } catch { continue; }
    const msg = rec.message || rec;
    const role = msg.role || rec.type;
    if (role === "user" && !prompt) {
      const t = textOf(msg.content).trim();
      if (t) prompt = t;
    } else if (role === "assistant") {
      const t = textOf(msg.content).trim();
      if (t) output = t;
    }
  }
  return { prompt, output };
}
