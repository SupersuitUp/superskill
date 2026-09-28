// A small YAML frontmatter reader for the subset SKILL.md files and hyperspecs use: scalars,
// quoted strings, folded (>) and literal (|) blocks, maps and lists nested to any depth by
// indentation, and inline lists.
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

// Nesting, added in 0.2.0: maps inside maps, lists of maps, lists inside maps, block scalars
// at any depth, read by indentation. Until then the reader stopped at one level and IGNORED
// anything deeper, so a list of maps came back as nothing and no error said so. Values still
// stay strings. A stray indented line at the top level is still tolerated, as before.
// 0.2.1: an unquoted value or list item that is only a comment (`key: # TODO`, `- # none yet`)
// reads as empty, the same as no value at all, which is what YAML means. A comment-only value
// that is followed by a more-indented block still opens that nested map or list, exactly as
// `key:` with nothing after it does.
export function parseYamlSubset(lines) {
  return parseMap(lines, 0, 0, true)[0];
}

const isBlank = (l) => !l.trim() || l.trimStart().startsWith("#");
const isItem = (t) => t === "-" || t.startsWith("- ");
const KEY = /^([^:\s"'][^:]*?|"[^"]*"|'[^']*')\s*:(?:\s+(.*)|\s*)$/;

function nextContent(lines, i) {
  while (i < lines.length && isBlank(lines[i])) i++;
  return i;
}

function parseMap(lines, i, indent, top = false) {
  const out = {};
  while (i < lines.length) {
    if (isBlank(lines[i])) { i++; continue; }
    const line = lines[i];
    const ind = indentOf(line);
    if (ind < indent) break;
    if (ind > indent) {
      if (top) { i++; continue; } // stray indented line at the top: tolerate, as before
      break;
    }
    const t = line.trim();
    if (isItem(t)) break;
    const m = t.match(KEY);
    if (!m) throw new Error(`cannot read line ${i + 1}: ${line.slice(0, 60)}`);
    const key = m[1].trim().replace(/^["']|["']$/g, "");
    const rest = (m[2] ?? "").trim();
    i++;
    if (/^[>|][+-]?$/.test(rest)) {
      const [v, next] = readBlock(lines, i, ind, rest[0]);
      out[key] = v; i = next; continue;
    }
    if (rest === "" || rest.startsWith("#")) {
      const j = nextContent(lines, i);
      if (j < lines.length) {
        const ci = indentOf(lines[j]);
        const ct = lines[j].trim();
        if (ci > ind) { [out[key], i] = isItem(ct) ? parseList(lines, j, ci) : parseMap(lines, j, ci); continue; }
        if (ci === ind && isItem(ct)) { [out[key], i] = parseList(lines, j, ci); continue; }
      }
      out[key] = ""; continue;
    }
    out[key] = inlineOrScalar(rest);
  }
  return [out, i];
}

function parseList(lines, i, indent) {
  const out = [];
  while (i < lines.length) {
    if (isBlank(lines[i])) { i++; continue; }
    const line = lines[i];
    const ind = indentOf(line);
    if (ind < indent) break;
    if (ind > indent) { i++; continue; }
    const t = line.trim();
    if (!isItem(t)) break;
    const content = t === "-" ? "" : t.slice(1).trimStart();
    const at = line.indexOf(content, ind + 1); // where the item's content starts on the line
    i++;
    if (content === "" || content.startsWith("#")) {
      const j = nextContent(lines, i);
      if (j < lines.length && indentOf(lines[j]) > ind) {
        const ci = indentOf(lines[j]);
        let v; [v, i] = isItem(lines[j].trim()) ? parseList(lines, j, ci) : parseMap(lines, j, ci);
        out.push(v);
      } else out.push("");
      continue;
    }
    if (KEY.test(content) && !/^\[.*\]$/.test(content)) {
      // "- key: value" opens a map whose keys sit where this content starts.
      const sub = [" ".repeat(at) + content, ...lines.slice(i)];
      const [v, used] = parseMap(sub, 0, at);
      out.push(v); i += used - 1; continue;
    }
    out.push(inlineOrScalar(content));
  }
  return [out, i];
}

function readBlock(lines, i, keyIndent, style) {
  const block = [];
  while (i < lines.length && (lines[i].trim() === "" || indentOf(lines[i]) > keyIndent)) { block.push(lines[i]); i++; }
  while (block.length && !block[block.length - 1].trim()) block.pop();
  const min = Math.min(...block.filter((l) => l.trim()).map(indentOf));
  const stripped = block.map((l) => l.slice(Number.isFinite(min) ? min : 0));
  return [style === "|" ? stripped.join("\n") : foldLines(stripped), i];
}

function inlineOrScalar(rest) {
  if (rest.startsWith("[") && rest.endsWith("]")) return splitInline(rest.slice(1, -1)).map(scalar).filter((s) => s !== "");
  return scalar(rest);
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
