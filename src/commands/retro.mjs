import { parseArgs } from "../args.mjs";
import { skillDir } from "./common.mjs";
import { decideOwner } from "../retro.mjs";
import { locate, withPushAccess } from "../source.mjs";
import { readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { parseSkillFile } from "../frontmatter.mjs";

export const help = `superskill retro <skill> [--json] [--no-network]

After a run of the skill that did not go cleanly (a tool failed, the person corrected it), say who
fixes it and how. The owner (a skill only you have, or a repo you can push to) fixes it at the
source with a regression eval, bumps the version and releases it. Anyone else suggests the fix to
the owner. Push access is read through gh; with --no-network a repo's owner is unknown, which is
treated as not you.

Exit 0: you own it. Exit 1: you do not, or it could not be told.
`;

export async function run(argv) {
  const a = parseArgs(argv, ["no-network"]);
  if (a.flags.help) { process.stdout.write(help); return 0; }
  const dir = skillDir(a._[0], "retro");
  const where = locate(dir);
  if (!a.flags["no-network"]) withPushAccess(where);
  let skill = basename(dir);
  try { skill = parseSkillFile(readFileSync(join(dir, "SKILL.md"), "utf8")).data?.name || skill; } catch {}
  const out = { skill, folder: dir, ...where, ...decideOwner(where, skill) };
  if (a.flags.json) process.stdout.write(JSON.stringify(out, null, 2) + "\n");
  else {
    const who = out.owner === true ? "You own it" : out.owner === false ? "You do not own it" : "Ownership unknown, so treat it as not yours";
    process.stdout.write([`${who}: ${out.why}.`, ...out.steps.map((s, i) => `${i + 1}. ${s}`)].join("\n") + "\n");
  }
  return out.owner === true ? 0 : 1;
}
