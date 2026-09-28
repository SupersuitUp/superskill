#!/usr/bin/env node
// superskill: score agent skills as skill / tested / superskill. Zero dependencies.
import { UsageError } from "../src/args.mjs";
import { DoctorError } from "../src/doctor.mjs";

const COMMANDS = {
  doctor: "../src/commands/doctor.mjs",
  init: "../src/commands/init.mjs",
  miss: "../src/commands/miss.mjs",
  misses: "../src/commands/miss.mjs",
  fix: "../src/commands/fix.mjs",
  approve: "../src/commands/approve.mjs",
  collection: "../src/commands/collection.mjs",
};

const HELP = `superskill <command> [options]

Commands:
  doctor <path...>             score skills; exit 0 when the target level is met
  init <path>                  add missing evals, triggers, goldens and MISSES.md
  miss <path> "<what>"         log a miss
  fix <path> <miss-id> --eval  close a miss with the regression eval that guards it
  approve <path> <golden>      record a person's approval of a golden (terminal only)
  collection <folder>          listing budget, cut-off descriptions, overlapping skills
  snippet                      print a block for AGENTS.md / CLAUDE.md

Run "superskill <command> --help" for details. Spec: SPEC.md.
`;

async function main(argv) {
  const [cmd, ...rest] = argv;
  if (!cmd || cmd === "--help" || cmd === "-h" || cmd === "help") { process.stdout.write(HELP); return 0; }
  if (cmd === "--version") {
    const { readFileSync } = await import("node:fs");
    process.stdout.write(JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version + "\n");
    return 0;
  }
  const mod = COMMANDS[cmd];
  if (!mod) throw new UsageError(`unknown command "${cmd}". Run superskill --help.`);
  const { run } = await import(mod);
  return run(rest);
}

main(process.argv.slice(2)).then(
  (code) => { process.exitCode = code; },
  (e) => {
    if (e instanceof UsageError || e instanceof DoctorError || e?.code === "SUPERSKILL") {
      process.stderr.write(`superskill: ${e.message}\n`);
      process.exitCode = 2;
    } else {
      process.stderr.write(`superskill: unexpected error: ${e?.stack || e}\n`);
      process.exitCode = 2;
    }
  },
);
