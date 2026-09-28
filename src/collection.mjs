// Checks that only make sense for a SET of skills: how much of a harness's skill-listing
// budget they use, which entries get cut off, and which pairs overlap enough that an
// agent could load the wrong one. Plus the plugin line for a packaged set.
import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, relative, sep } from "node:path";
import { findSkills } from "./doctor.mjs";
import { loadSkill, listFiles } from "./context.mjs";

/** Characters a harness shows per skill before cutting the entry off. */
export const ENTRY_CAP = 1536;
/** Default listing budgets, in characters. Override with --budget. */
export const BUDGETS = { "claude-code": 8000, codex: 8000 };
export const OVERLAP = 0.5;

const STOP = new Set(("a an and are as at be by can do does for from has have how i if in into is it its of on or " +
  "so that the their them then there these this to use used uses using via was what when where which who will " +
  "with you your someone asks ask user users wants want skill skills not any all also one more other").split(" "));

export function listingEntry(data) {
  const s = (v) => (typeof v === "string" ? v.trim() : "");
  const tail = [s(data.description), s(data.when_to_use)].filter(Boolean).join(" ");
  return `${s(data.name)}: ${tail}`;
}

export function tokens(text) {
  return new Set(String(text).toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 2 && !STOP.has(t)));
}

export function jaccard(a, b) {
  const A = tokens(a), B = tokens(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return inter / (A.size + B.size - inter);
}

/**
 * collection(paths, {budget, overlap}) -> {skills, total_chars, budgets, truncated, overlaps, plugin}
 * `listed_chars` is what the harness actually shows (capped per entry); totals use it.
 */
export function collection(paths, opts = {}) {
  const dirs = [];
  for (const p of paths) dirs.push(...findSkills(p));
  const seen = new Set();
  const skills = [];
  for (const d of dirs) {
    if (seen.has(d)) continue;
    seen.add(d);
    const ctx = loadSkill(d);
    const name = typeof ctx.data.name === "string" && ctx.data.name ? ctx.data.name : ctx.folderName;
    const entry = listingEntry({ ...ctx.data, name });
    skills.push({ name, path: d, chars: entry.length, listed_chars: Math.min(entry.length, ENTRY_CAP), description: typeof ctx.data.description === "string" ? ctx.data.description : "" });
  }
  const total = skills.reduce((n, s) => n + s.listed_chars, 0);
  const limits = opts.budget ? Object.fromEntries(Object.keys(BUDGETS).map((k) => [k, Number(opts.budget)])) : BUDGETS;
  const budgets = Object.entries(limits).map(([harness, limit]) => ({ harness, limit, used: total, over: Math.max(0, total - limit) }));
  const truncated = skills.filter((s) => s.chars > ENTRY_CAP).map((s) => ({ name: s.name, chars: s.chars, cut: s.chars - ENTRY_CAP }));

  const threshold = opts.overlap ?? OVERLAP;
  const overlaps = [];
  for (let i = 0; i < skills.length; i++) {
    for (let j = i + 1; j < skills.length; j++) {
      const a = skills[i], b = skills[j];
      const score = jaccard(a.description, b.description);
      if (score >= threshold) {
        overlaps.push({
          a: a.name, b: b.name, score: Math.round(score * 100) / 100,
          suggest: [
            { skill: a.name, trigger: { query: nearMiss(b), should_trigger: false } },
            { skill: b.name, trigger: { query: nearMiss(a), should_trigger: false } },
          ],
        });
      }
    }
  }
  overlaps.sort((x, y) => y.score - x.score);
  const out = { skills: skills.map(({ description, ...s }) => s), total_chars: total, budgets, truncated, overlaps };
  if (paths.length === 1) {
    const plugin = pluginReport(paths[0]);
    if (plugin) out.plugin = plugin;
  }
  out.ok = budgets.every((b) => b.over === 0) && truncated.length === 0;
  return out;
}

/** A near-miss request built from the other skill's own description. */
function nearMiss(other) {
  const first = other.description.split(/(?<=[.!?])\s/)[0].replace(/\.$/, "");
  return `${first.slice(0, 200)} (this is ${other.name}'s job)`;
}

/** The plugin line: version, changelog entry for it, helpers copied between skills. */
export function pluginReport(root) {
  const manifest = join(root, ".claude-plugin", "plugin.json");
  if (!existsSync(manifest)) return null;
  const findings = [];
  let meta = {};
  try { meta = JSON.parse(readFileSync(manifest, "utf8")); }
  catch (e) { findings.push({ rule: "plugin-manifest", severity: "fail", message: `.claude-plugin/plugin.json is not valid JSON: ${e.message}`, fix: "Fix the manifest." }); }
  const version = typeof meta.version === "string" ? meta.version : null;
  if (!version) findings.push({ rule: "plugin-version", severity: "fail", message: "plugin.json has no version", fix: "Add a semver version and bump it on every release." });
  let changelogHas = false;
  const cl = join(root, "CHANGELOG.md");
  if (!existsSync(cl)) findings.push({ rule: "plugin-changelog", severity: "fail", message: "no CHANGELOG.md", fix: "Add a CHANGELOG.md with an entry per release." });
  else if (version) {
    const esc = version.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    changelogHas = new RegExp(`^#+\\s*\\[?v?${esc}\\b`, "m").test(readFileSync(cl, "utf8"));
    if (!changelogHas) findings.push({ rule: "plugin-changelog", severity: "fail", message: `CHANGELOG.md has no entry for ${version}`, fix: `Add a "## ${version}" entry saying what changed.` });
  }
  const byHash = new Map();
  for (const rel of listFiles(join(root, "skills"))) {
    if (/(^|\/)SKILL\.md$/.test(rel) || /\.(md|json)$/i.test(rel) || /(^|\/)(evals|goldens)\//.test(rel) || rel.endsWith(".gitkeep")) continue;
    const abs = join(root, "skills", rel);
    let buf;
    try { buf = readFileSync(abs); } catch { continue; }
    if (!buf.length) continue;
    const h = createHash("sha256").update(buf).digest("hex");
    const skillName = rel.split("/")[0];
    const list = byHash.get(h) || [];
    list.push({ skill: skillName, file: relative(root, abs).split(sep).join("/") });
    byHash.set(h, list);
  }
  const duplicates = [...byHash.values()].filter((l) => new Set(l.map((x) => x.skill)).size > 1).map((l) => ({ files: l.map((x) => x.file) }));
  for (const d of duplicates) findings.push({ rule: "plugin-shared-helpers", severity: "warn", message: `same file copied into ${d.files.length} skills: ${d.files.join(", ")}`, fix: "share this helper: keep one copy in a shared scripts/ folder and call it from each skill." });
  return { name: meta.name || null, version, changelog_has_version: changelogHas, duplicates, findings };
}
