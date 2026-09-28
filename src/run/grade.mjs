// Grading one output against one expectation. Machine checks (contains:, regex:,
// file_exists:) cost nothing; anything else is a plain-language statement graded by one
// extra headless call that must answer {"pass": boolean, "reason": string}.
import { existsSync } from "node:fs";
import { join } from "node:path";

export function isMachineCheck(a) {
  return /^(contains|regex|file_exists):/.test(String(a));
}

export function compileRegex(pattern) {
  let flags = "m";
  let p = pattern;
  const inline = p.match(/^\(\?([ims]+)\)/);
  if (inline) { p = p.slice(inline[0].length); for (const f of inline[1]) if (!flags.includes(f)) flags += f; }
  return new RegExp(p, flags);
}

export function gradeMachine(assertion, { output, cwd }) {
  const a = String(assertion);
  const i = a.indexOf(":");
  const kind = a.slice(0, i), arg = a.slice(i + 1);
  if (kind === "contains") return { pass: output.includes(arg), reason: `contains "${arg}"` };
  if (kind === "regex") {
    try { return { pass: compileRegex(arg).test(output), reason: `matches /${arg}/` }; }
    catch (e) { return { pass: false, reason: `bad regex: ${e.message}` }; }
  }
  if (kind === "file_exists") return { pass: Boolean(cwd) && existsSync(join(cwd, arg)), reason: `file ${arg} exists` };
  return { pass: false, reason: `unknown check ${kind}` };
}

export function graderPrompt(assertion, { prompt, output }) {
  return [
    "You are grading one output from an AI assistant against one expectation.",
    "Answer with ONLY a JSON object: {\"pass\": true|false, \"reason\": \"<one sentence>\"}.",
    "", "<request>", prompt, "</request>", "", "<output>", output, "</output>", "",
    "<expectation>", String(assertion), "</expectation>",
  ].join("\n");
}

/** Parse the grader's reply; anything that is not a clear pass is a fail. */
export function parseVerdict(text) {
  const m = String(text).match(/\{[\s\S]*\}/);
  if (!m) return { pass: false, reason: "grader gave no JSON verdict" };
  try {
    const v = JSON.parse(m[0]);
    return { pass: v.pass === true, reason: String(v.reason || "") };
  } catch {
    return { pass: false, reason: "grader verdict was not valid JSON" };
  }
}

export function grade(assertion, ctx, harness) {
  if (isMachineCheck(assertion)) return gradeMachine(assertion, ctx);
  return parseVerdict(harness.ask(graderPrompt(assertion, ctx), { model: ctx.graderModel }));
}
