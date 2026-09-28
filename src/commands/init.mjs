import { existsSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs, UsageError } from "../args.mjs";
import { skillDir } from "./common.mjs";
import { MISSES_HEADER } from "../misses.mjs";
import { readSession } from "../session.mjs";
import { parseSkillFile } from "../frontmatter.mjs";

export const help = `superskill init <skill> [--from-session <transcript>]

Add whatever a skill is missing to climb the levels: evals/evals.json (an example case),
evals/triggers.json (example should / should-not requests), goldens/, and MISSES.md.
Never overwrites a file that exists.

--from-session <file>  build the first eval and golden candidate from the session where
                       the job was done by hand. A Claude Code .jsonl gives the first
                       request and the final answer; any other file is the request.
                       The golden waits for a person: run \`superskill approve\`.
`;

const TRIGGER_EXAMPLE = [
  { query: "REPLACE: a realistic request that should load this skill", should_trigger: true },
  { query: "REPLACE: a near-miss that shares words with this skill but needs something else", should_trigger: false },
];

export async function run(argv) {
  const a = parseArgs(argv);
  if (a.flags.help) { process.stdout.write(help); return 0; }
  const dir = skillDir(a._[0], "init");
  const name = parseSkillFile(readFileSync(join(dir, "SKILL.md"), "utf8")).data.name || "";
  const session = a.flags["from-session"];
  if (session !== undefined && (session === true || !existsSync(session))) throw new UsageError(`--from-session file not found: ${session}`);
  const made = [], kept = [];
  const put = (rel, content) => {
    const p = join(dir, rel);
    if (existsSync(p)) { kept.push(rel); return false; }
    mkdirSync(join(p, ".."), { recursive: true });
    writeFileSync(p, content);
    made.push(rel);
    return true;
  };

  let sessionCase = null;
  if (session) {
    const { prompt, output } = readSession(session);
    if (!prompt) throw new UsageError(`no request found in ${session}`);
    sessionCase = { prompt, output };
  }

  const evalsPath = join(dir, "evals", "evals.json");
  const example = { id: 1, prompt: "REPLACE: a real request this skill handles", expected_output: "REPLACE: what a good answer looks like", files: [], expectations: ["REPLACE: a statement a grader can check, or contains:<text> / regex:<pattern>"] };
  put("evals/evals.json", JSON.stringify({ skill_name: name, evals: sessionCase ? [] : [example] }, null, 2) + "\n");
  put("evals/triggers.json", JSON.stringify(TRIGGER_EXAMPLE, null, 2) + "\n");
  put("goldens/.gitkeep", "");
  put("MISSES.md", MISSES_HEADER);

  if (sessionCase) {
    const doc = JSON.parse(readFileSync(evalsPath, "utf8"));
    const list = Array.isArray(doc) ? doc : (doc.evals ||= []);
    const taken = new Set(list.map((c) => String(c.id)));
    let n = 1;
    while (taken.has(`s${n}`) || existsSync(join(dir, "goldens", `s${n}`))) n++;
    const id = `s${n}`;
    list.push({ id, prompt: sessionCase.prompt, expected_output: "Matches the approved output in goldens/" + id + "/", files: [], expectations: ["Output addresses the request in the prompt"] });
    writeFileSync(evalsPath, JSON.stringify(doc, null, 2) + "\n");
    put(`goldens/${id}/input.md`, sessionCase.prompt + "\n");
    put(`goldens/${id}/output.md`, sessionCase.output ? sessionCase.output + "\n" : "");
    process.stdout.write(`eval ${id} and golden candidate goldens/${id}/ written from ${session}\n`);
    process.stdout.write(`a person approves it with: superskill approve ${a._[0]} ${id}\n`);
  }
  for (const m of made) process.stdout.write(`created ${m}\n`);
  for (const k of kept) process.stdout.write(`kept    ${k} (exists)\n`);
  return 0;
}
