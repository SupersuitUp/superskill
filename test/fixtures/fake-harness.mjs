import { appendFileSync } from "node:fs";
// Test stand-in for a model harness. Never calls a model.
// case: with the skill, echo the prompt tagged SKILLED; without, a useless answer.
// ask (grading): pass when the graded output carries the SKILLED tag.
let input = "";
process.stdin.on("data", (d) => (input += d));
process.stdin.on("end", () => {
  const req = JSON.parse(input);
  // What the run's process was given, for the test that a sandbox run is never recorded as a real use.
  if (process.env.FAKE_ENV_LOG) appendFileSync(process.env.FAKE_ENV_LOG, JSON.stringify({ ledger: process.env.FREEDOM_SKILL_LEDGER ?? null, sandbox: process.env.SUPERSKILL_SANDBOX ?? null, cwd: req.cwd ?? null }) + "\n");
  if (req.mode === "case") {
    process.stdout.write(JSON.stringify({ output: req.withSkill ? `SKILLED ${req.prompt}` : "plain answer", tokens: req.withSkill ? 120 : 100, model: "fake-model-1" }));
  } else {
    const pass = /<output>\nSKILLED/.test(req.prompt);
    process.stdout.write(JSON.stringify({ output: `Verdict: {"pass": ${pass}, "reason": "fake"}` }));
  }
});
