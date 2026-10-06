// MISSES.md: one dated entry per time the skill got something wrong. It is also where a
// skill's history lives (0.6.0): the story of the incident that earned a rule goes here, and
// SKILL.md keeps only the rule and a one-line why.
//
//   ## m1 · 2026-09-20 · fixed
//   - What happened: ...                (an indented line under a field continues it)
//   - Should have: ...
//   - Fix: <commit sha or note: the rule now in SKILL.md>
//   - Eval: m1
//   - Quote: "what the person said"     (optional)
//   - Source: freedom-ledger <id>      (optional)
import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const MISSES_HEADER = `# Misses

Every time this skill got something wrong, and the story behind each rule it learned. An open
miss blocks the superskill level; a fixed miss must name the eval that would catch it again.
Written by \`superskill miss\` and \`superskill fix\`, and readable by hand.
`;

const HEAD_RE = /^##\s+(m\d+)\s*[·|\-–]\s*(\d{4}-\d{2}-\d{2})\s*[·|\-–]\s*(open|fixed)\s*$/i;
const FIELDS = { "what happened": "what", "should have": "expected", fix: "fix", eval: "eval", quote: "quote", source: "source" };

export function parseMisses(text) {
  const out = [];
  let cur = null;
  let last = null;
  const lines = String(text).replace(/\r\n?/g, "\n").split("\n");
  lines.forEach((line, i) => {
    const h = line.match(HEAD_RE);
    if (h) {
      cur = { id: h[1].toLowerCase(), date: h[2], status: h[3].toLowerCase(), what: "", expected: "", fix: "", eval: "", quote: "", source: "", line: i + 1 };
      last = null;
      out.push(cur);
      return;
    }
    if (/^##\s/.test(line)) { cur = null; last = null; return; }
    if (!cur) return;
    const f = line.match(/^\s*[-*]\s*([A-Za-z ]+?)\s*:\s*(.*)$/);
    const key = f && FIELDS[f[1].toLowerCase()];
    if (key) { cur[key] = f[2].trim(); last = key; return; }
    // A story rarely fits on one line: an indented line continues the field above it.
    if (last && /^\s{2,}\S/.test(line)) { cur[last] = `${cur[last]} ${line.trim()}`.trim(); return; }
    if (!line.trim()) return;
    last = null;
  });
  return out;
}

export function readMisses(dir) {
  const p = join(dir, "MISSES.md");
  if (!existsSync(p)) return null;
  return parseMisses(readFileSync(p, "utf8"));
}

export function formatMiss(m) {
  const lines = [`## ${m.id} · ${m.date} · ${m.status}`, `- What happened: ${m.what}`];
  if (m.expected) lines.push(`- Should have: ${m.expected}`);
  lines.push(`- Fix: ${m.fix || ""}`, `- Eval: ${m.eval || ""}`);
  if (m.quote) lines.push(`- Quote: ${m.quote}`);
  if (m.source) lines.push(`- Source: ${m.source}`);
  return lines.join("\n") + "\n";
}

export function nextMissId(misses) {
  const n = misses.reduce((max, m) => Math.max(max, Number(m.id.slice(1)) || 0), 0);
  return `m${n + 1}`;
}

/** Append entries to MISSES.md, creating it with its header when absent. */
export function appendMisses(dir, entries) {
  const p = join(dir, "MISSES.md");
  let text = existsSync(p) ? readFileSync(p, "utf8") : MISSES_HEADER;
  if (!text.endsWith("\n")) text += "\n";
  for (const e of entries) text += "\n" + formatMiss(e);
  writeFileSync(p, text);
}

/** Rewrite one entry in place (status, fix, eval), leaving the rest of the file byte-identical. */
export function updateMiss(dir, id, patch) {
  const p = join(dir, "MISSES.md");
  const lines = readFileSync(p, "utf8").split("\n");
  const start = lines.findIndex((l) => { const h = l.match(HEAD_RE); return h && h[1].toLowerCase() === id; });
  if (start < 0) return false;
  let end = lines.findIndex((l, i) => i > start && /^##\s/.test(l));
  if (end < 0) end = lines.length;
  const [cur] = parseMisses(lines.slice(start, end).join("\n"));
  const next = { ...cur, ...patch };
  let block = formatMiss(next).replace(/\n$/, "").split("\n");
  // keep any trailing blank lines the original block had
  const tail = [];
  for (let i = end - 1; i > start && lines[i].trim() === ""; i--) tail.push("");
  lines.splice(start, end - start, ...block, ...tail);
  writeFileSync(p, lines.join("\n"));
  return true;
}
