import { mkdtempSync, mkdirSync, symlinkSync, cpSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";

/**
 * A fresh working folder for one run. With `linkAt` (e.g. ".claude/skills"), the skill is
 * symlinked in as <linkAt>/<name>; without it the folder has no skill at all. Case input
 * files (paths relative to the skill) are copied in at the same relative paths.
 */
export function prepareWorkspace({ skillDir, skillName, files = [], linkAt = null }) {
  const cwd = mkdtempSync(join(tmpdir(), "superskill-run-"));
  if (linkAt) {
    const target = join(cwd, linkAt, skillName);
    mkdirSync(dirname(target), { recursive: true });
    symlinkSync(skillDir, target, "dir");
  }
  for (const rel of files) {
    const src = join(skillDir, rel);
    if (!existsSync(src)) continue;
    const dst = join(cwd, rel);
    mkdirSync(dirname(dst), { recursive: true });
    cpSync(src, dst, { recursive: true });
  }
  return cwd;
}
