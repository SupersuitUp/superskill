import { readFileSync } from "node:fs";

export const help = `superskill snippet

Print a block to paste into AGENTS.md or CLAUDE.md so any agent proposes a skill after doing
a job once, logs a miss whenever a skill needed correcting, and runs the doctor before
calling a skill done.
`;

export async function run(argv) {
  if (argv.includes("--help") || argv.includes("-h")) { process.stdout.write(help); return 0; }
  process.stdout.write(readFileSync(new URL("../snippet.md", import.meta.url), "utf8"));
  return 0;
}
