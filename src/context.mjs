import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, basename, resolve, relative, sep } from "node:path";
import { parseSkillFile } from "./frontmatter.mjs";

const SKIP_DIRS = new Set([".git", "node_modules", "__pycache__", ".venv", "venv", "dist", "build"]);
const MAX_FILES = 2000;

/** Every file under dir, relative, forward slashes. Follows symlinked dirs once, never loops. */
export function listFiles(dir) {
  const out = [];
  const seen = new Set();
  const walk = (abs) => {
    let real;
    try { real = resolve(abs); } catch { return; }
    if (seen.has(real)) return;
    seen.add(real);
    let entries;
    try { entries = readdirSync(abs, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (out.length >= MAX_FILES) return;
      const p = join(abs, e.name);
      let isDir = e.isDirectory();
      let isFile = e.isFile();
      if (e.isSymbolicLink()) {
        try { const s = statSync(p); isDir = s.isDirectory(); isFile = s.isFile(); } catch { continue; }
      }
      if (isDir) { if (!SKIP_DIRS.has(e.name)) walk(p); }
      else if (isFile) out.push(relative(dir, p).split(sep).join("/"));
    }
  };
  walk(dir);
  return out.sort();
}

export function readText(dir, rel) {
  try { return readFileSync(join(dir, rel), "utf8"); } catch { return null; }
}

/**
 * Load one skill folder into the context every rule reads.
 * Never throws: an unreadable skill comes back with `error` set.
 */
export function loadSkill(dir) {
  const abs = resolve(dir);
  const ctx = { dir: abs, folderName: basename(abs), data: {}, body: "", bodyStartLine: 1, raw: "", files: [] };
  const skillPath = join(abs, "SKILL.md");
  if (!existsSync(skillPath)) return { ...ctx, error: "no SKILL.md in this folder" };
  try {
    ctx.raw = readFileSync(skillPath, "utf8");
  } catch (e) {
    return { ...ctx, error: `cannot read SKILL.md: ${e.code || e.message}` };
  }
  const parsed = parseSkillFile(ctx.raw);
  ctx.data = parsed.data;
  ctx.body = parsed.body;
  ctx.bodyStartLine = parsed.bodyStartLine;
  if (parsed.error) ctx.parseError = parsed.error;
  ctx.files = listFiles(abs);
  return ctx;
}
