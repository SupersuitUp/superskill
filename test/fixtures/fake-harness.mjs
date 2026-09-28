// Test stand-in for a model harness. Never calls a model.
// case: with the skill, echo the prompt tagged SKILLED; without, a useless answer.
// ask (grading): pass when the graded output carries the SKILLED tag.
let input = "";
process.stdin.on("data", (d) => (input += d));
process.stdin.on("end", () => {
  const req = JSON.parse(input);
  if (req.mode === "case") {
    process.stdout.write(JSON.stringify({ output: req.withSkill ? `SKILLED ${req.prompt}` : "plain answer", tokens: req.withSkill ? 120 : 100, model: "fake-model-1" }));
  } else {
    const pass = /<output>\nSKILLED/.test(req.prompt);
    process.stdout.write(JSON.stringify({ output: `Verdict: {"pass": ${pass}, "reason": "fake"}` }));
  }
});
