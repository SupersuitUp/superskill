// The update gate: which skills did a change touch, and did any of them lose a level.
import { spawnSync } from "node:child_process";
import { join, resolve, sep } from "node:path";
import { realpathSync } from "node:fs";
import { DoctorError } from "./doctor.mjs";
import { LEVELS } from "./levels.mjs";

function git(cwd, args) {
  const r = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (r.error) throw new DoctorError(`git is not available: ${r.error.message}`);
  return r;
}

const real = (p) => { try { return realpathSync(p); } catch { return resolve(p); } };

/** Absolute paths changed since `base` (committed) plus staged, unstaged and untracked. */
export function changedFiles(path, base) {
  const top = git(path, ["rev-parse", "--show-toplevel"]);
  if (top.status !== 0) throw new DoctorError(`--changed needs a git repository: ${path} is not in one`);
  const root = top.stdout.trim();
  const files = new Set();
  const add = (out) => out.split("\n").map((l) => l.trim()).filter(Boolean).forEach((f) => files.add(real(join(root, f))));
  if (base) {
    const d = git(root, ["diff", "--name-only", `${base}...HEAD`]);
    if (d.status !== 0) throw new DoctorError(`git diff against ${base} failed: ${d.stderr.trim()}`);
    add(d.stdout);
  }
  add(git(root, ["diff", "--name-only", "HEAD"]).stdout);
  add(git(root, ["ls-files", "--others", "--exclude-standard"]).stdout);
  return [...files];
}

/** Keep the skill dirs that contain at least one changed file. */
export function touchedSkills(dirs, files) {
  return dirs.filter((d) => {
    const prefix = real(d) + sep;
    return files.some((f) => f.startsWith(prefix));
  });
}

/** Compare against a previous `doctor --json`: every skill whose level went down. */
export function levelDrops(current, baseline) {
  const rank = (l) => (l === "none" ? -1 : LEVELS.indexOf(l));
  const before = new Map();
  for (const s of baseline.skills || []) { before.set(s.path, s); before.set(`name:${s.name}`, s); }
  const drops = [];
  for (const s of current.skills) {
    const b = before.get(s.path) || before.get(`name:${s.name}`);
    if (b && rank(s.level) < rank(b.level)) drops.push({ name: s.name, path: s.path, from: b.level, to: s.level });
  }
  return drops;
}
