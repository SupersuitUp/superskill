import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { UsageError } from "../args.mjs";

/** Resolve a skill folder argument or throw a usage error naming what is wrong. */
export function skillDir(arg, cmd) {
  if (!arg) throw new UsageError(`${cmd} needs a skill folder`);
  const dir = resolve(arg);
  if (!existsSync(join(dir, "SKILL.md"))) throw new UsageError(`no SKILL.md in ${arg}`);
  return dir;
}

export const today = (now) => now.toISOString().slice(0, 10);

/** A refusal: the command understood the request and declines it (exit 1). */
export function refuse(message) {
  process.stderr.write(`superskill: ${message}\n`);
  return 1;
}
