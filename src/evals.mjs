// Readers for evals/evals.json and evals/triggers.json. Both follow Anthropic's
// skill-creator formats: evals.json is {skill_name, evals: [{id, prompt, expected_output,
// files, expectations}]}; triggers.json is [{query, should_trigger}]. On read we also
// accept `assertions` for `expectations` and a bare array for evals.json.
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

function readJson(path) {
  if (!existsSync(path)) return { missing: true };
  try { return { value: JSON.parse(readFileSync(path, "utf8")) }; }
  catch (e) { return { error: `${e.message}` }; }
}

export function readEvals(dir) {
  const r = readJson(join(dir, "evals", "evals.json"));
  if (r.missing) return { missing: true, cases: [] };
  if (r.error) return { error: `evals/evals.json is not valid JSON: ${r.error}`, cases: [] };
  const list = Array.isArray(r.value) ? r.value : Array.isArray(r.value?.evals) ? r.value.evals : null;
  if (!list) return { error: "evals/evals.json has no evals array", cases: [] };
  const cases = list.map((c, i) => ({
    id: c?.id ?? i + 1,
    prompt: typeof c?.prompt === "string" ? c.prompt : "",
    expected_output: c?.expected_output ?? "",
    files: Array.isArray(c?.files) ? c.files : [],
    assertions: Array.isArray(c?.expectations) ? c.expectations : Array.isArray(c?.assertions) ? c.assertions : [],
  }));
  return { cases, skill_name: r.value?.skill_name };
}

export function readTriggers(dir) {
  const r = readJson(join(dir, "evals", "triggers.json"));
  if (r.missing) return { missing: true, triggers: [] };
  if (r.error) return { error: `evals/triggers.json is not valid JSON: ${r.error}`, triggers: [] };
  const list = Array.isArray(r.value) ? r.value : Array.isArray(r.value?.triggers) ? r.value.triggers : null;
  if (!list) return { error: "evals/triggers.json is not a list of {query, should_trigger}", triggers: [] };
  return { triggers: list.filter((t) => t && typeof t.query === "string").map((t) => ({ query: t.query, should_trigger: t.should_trigger === true })) };
}

export function readLatestRun(dir) {
  const r = readJson(join(dir, "evals", "results", "latest.json"));
  if (r.missing) return { missing: true };
  if (r.error) return { error: `evals/results/latest.json is not valid JSON: ${r.error}` };
  return { run: r.value };
}
