// A small YAML frontmatter reader for the subset SKILL.md files use: scalars, quoted
// strings, folded (>) and literal (|) blocks, one-level maps, inline and block lists.
// Values stay strings; rules decide what a string means. Zero dependencies on purpose.

export function parseSkillFile(text) {
  const src = String(text).replace(/\r\n?/g, "\n");
  const lines = src.split("\n");
  if (lines[0].trim() !== "---") return { data: {}, body: src, bodyStartLine: 1, error: "no frontmatter" };
  let end = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === "---") { end = i; break; }
  }
  if (end === -1) return { data: {}, body: "", bodyStartLine: 1, error: "unterminated frontmatter" };
  let data;
  try {
    data = parseYamlSubset(lines.slice(1, end));
  } catch (e) {
    return { data: {}, body: lines.slice(end + 1).join("\n"), bodyStartLine: end + 2, error: `frontmatter: ${e.message}` };
  }
  return { data, body: lines.slice(end + 1).join("\n"), bodyStartLine: end + 2 };
}

const indentOf = (l) => l.length - l.trimStart().length;

export function parseYamlSubset(lines) {
  const out = {};
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim() || line.trimStart().startsWith("#")) { i++; continue; }
    if (indentOf(line) > 0) { i++; continue; } // stray indented line: tolerate
    const m = line.match(/^([^:\s][^:]*?)\s*:(?:\s+(.*)|\s*)$/);
    if (!m) throw new Error(`cannot read line ${i + 1}: ${line.slice(0, 60)}`);
    const key = m[1].trim().replace(/^["']|["']$/g, "");
    const rest = (m[2] ?? "").trim();
    i++;
    if (/^[>|][+-]?$/.test(rest)) {
      const block = [];
      while (i < lines.length && (lines[i].trim() === "" || indentOf(lines[i]) > 0)) { block.push(lines[i]); i++; }
      while (block.length && !block[block.length - 1].trim()) block.pop();
      const min = Math.min(...block.filter((l) => l.trim()).map(indentOf));
      const stripped = block.map((l) => l.slice(Number.isFinite(min) ? min : 0));
      out[key] = rest[0] === "|" ? stripped.join("\n") : foldLines(stripped);
      continue;
    }
    if (rest === "") {
      const child = [];
      while (i < lines.length && (lines[i].trim() === "" || indentOf(lines[i]) > 0 || lines[i].trimStart().startsWith("- "))) {
        if (indentOf(lines[i]) === 0 && lines[i].trim() && !lines[i].startsWith("- ")) break;
        child.push(lines[i]); i++;
      }
      const items = child.filter((l) => l.trim() && !l.trim().startsWith("#"));
      if (!items.length) out[key] = "";
      else if (items[0].trim().startsWith("- ") || items[0].trim() === "-") out[key] = items.map((l) => scalar(l.trim().replace(/^-\s*/, "")));
      else {
        const map = {};
        const base = indentOf(items[0]);
        for (const l of items) {
          if (indentOf(l) !== base) continue; // deeper nesting is outside the subset; ignored
          const mm = l.trim().match(/^([^:]+?)\s*:\s*(.*)$/);
          if (mm) map[mm[1].trim().replace(/^["']|["']$/g, "")] = scalar(mm[2]);
        }
        out[key] = map;
      }
      continue;
    }
    if (rest.startsWith("[") && rest.endsWith("]")) {
      out[key] = splitInline(rest.slice(1, -1)).map(scalar).filter((s) => s !== "");
      continue;
    }
    out[key] = scalar(rest);
  }
  return out;
}

function foldLines(lines) {
  let s = "";
  for (const l of lines) {
    if (!l.trim()) s += "\n";
    else s += (s && !s.endsWith("\n") ? " " : "") + l.trim();
  }
  return s;
}

function splitInline(s) {
  const parts = [];
  let cur = "", q = null;
  for (const ch of s) {
    if (q) { cur += ch; if (ch === q) q = null; }
    else if (ch === '"' || ch === "'") { q = ch; cur += ch; }
    else if (ch === ",") { parts.push(cur); cur = ""; }
    else cur += ch;
  }
  parts.push(cur);
  return parts.map((p) => p.trim());
}

function scalar(raw) {
  const s = String(raw).trim();
  if (s.startsWith('"')) {
    const end = s.lastIndexOf('"');
    try { return JSON.parse(s.slice(0, end + 1)); } catch { return s.slice(1, end > 0 ? end : undefined); }
  }
  if (s.startsWith("'")) {
    const end = s.lastIndexOf("'");
    return s.slice(1, end > 0 ? end : undefined).replace(/''/g, "'");
  }
  return s.replace(/\s+#.*$/, "");
}
