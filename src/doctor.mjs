import { existsSync, statSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { loadSkill } from "./context.mjs";
import { allRules } from "./rules/index.mjs";
import { runRules, computeLevel, nextLevel, meets } from "./levels.mjs";

export class DoctorError extends Error {}

const isDir = (p) => { try { return statSync(p).isDirectory(); } catch { return false; } };
const hasSkill = (p) => existsSync(join(p, "SKILL.md"));

/**
 * Resolve a path to skill folders: the path itself if it holds SKILL.md, otherwise every
 * direct child that does, plus skills/<name>/ for a plugin root.
 */
export function findSkills(path) {
  const abs = resolve(path);
  if (!existsSync(abs)) throw new DoctorError(`path not found: ${path}`);
  if (!isDir(abs)) throw new DoctorError(`not a folder: ${path}`);
  if (hasSkill(abs)) return [abs];
  const out = [];
  const scan = (dir) => {
    let names = [];
    try { names = readdirSync(dir).sort(); } catch { return; }
    for (const n of names) {
      if (n.startsWith(".")) continue;
      const p = join(dir, n);
      if (isDir(p) && hasSkill(p)) out.push(p);
    }
  };
  scan(abs);
  if (isDir(join(abs, "skills"))) scan(join(abs, "skills"));
  return out;
}

/** Score one loaded skill. */
export function scoreSkill(dir, opts = {}) {
  const ctx = loadSkill(dir);
  const findings = runRules(ctx, opts.rules || allRules, opts);
  const level = computeLevel(findings);
  const up = nextLevel(level);
  const next = up ? findings.filter((f) => f.level === up && f.severity === "fail") : [];
  return { path: ctx.dir, name: typeof ctx.data.name === "string" && ctx.data.name ? ctx.data.name : ctx.folderName, level, next, findings };
}

/**
 * doctor(paths, {level, now}) -> {skills, ok, target}
 * `ok` is true when every skill reaches the target level (default "skill").
 */
export function doctor(paths, opts = {}) {
  const target = opts.level || "skill";
  const dirs = [];
  for (const p of paths) dirs.push(...findSkills(p));
  if (!dirs.length) throw new DoctorError(`no skills found under ${paths.join(", ")} (looked for SKILL.md in the folder, its children, and skills/*/)`);
  const skills = [...new Set(dirs)].map((d) => scoreSkill(d, opts));
  return { target, ok: skills.every((s) => meets(s.level, target)), skills };
}
