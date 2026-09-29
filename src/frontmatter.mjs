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
// 0.2.2: an inline flow map (`scope: { form: essay, audience: builders }`) reads as an object,
// nested to any depth (a flow map inside a flow map, a flow list inside a flow map). And an
// inline flow list followed by a same-line comment (`conditions: [r1, r2, r3]   # 5 to 10 ids`)
// reads as a list instead of the whole `[...]  # ...` text, because the flow value is now parsed
// character-by-character (quote-aware) instead of by checking whether the raw value ends in `]`.
// Malformed flow syntax (unbalanced brackets) never throws: it falls back to the raw string, the
// same as an unrecognized value always has.
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
    if (content.startsWith("{") || content.startsWith("[")) {
      // A bare flow map/list item (`- { station: fine, severity: fail }`, `- [a, b]`) is not a
      // "- key: value" line, even though the KEY regex below would happily match on the first
      // colon inside the braces (reading "{ station" as the key, which produced garbage). Try
      // the flow parse first; when it is malformed, `inlineOrScalar` falls back to the raw
      // string via `scalar()`, same as an unrecognized top-level value always has. Either way
      // this never falls through to the "- key: value" submap heuristic below, because a flow
      // collection's opening bracket can never legitimately be a map key.
      out.push(inlineOrScalar(content)); continue;
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
  if (rest.startsWith("[") || rest.startsWith("{")) {
    const flow = tryParseFlow(rest);
    if (flow !== undefined) return flow;
  }
  return scalar(rest);
}

// A flow collection (`[...]` or `{...}`) parsed character-by-character so quotes can protect a
// `,` `]` `}` or `#` from being read as structure, and so trailing whitespace plus a same-line
// comment after the closing bracket does not fall the whole value back to a raw string. Returns
// `undefined` (never throws) when `rest` is not a clean flow value: unbalanced brackets, an
// unterminated quote, or trailing content that is neither blank nor a comment. The caller falls
// back to `scalar(rest)` in every one of those cases, same as an unrecognized value always has.
function tryParseFlow(rest) {
  let parsed;
  try {
    parsed = readFlowCollection(rest, 0);
  } catch {
    return undefined;
  }
  const trailing = rest.slice(parsed.end);
  if (trailing.trim() === "" || /^\s+#/.test(trailing)) return parsed.value;
  return undefined;
}

function readFlowCollection(s, i) {
  const open = s[i];
  const close = open === "{" ? "}" : "]";
  const isMap = open === "{";
  i = skipFlowWs(s, i + 1);
  if (s[i] === close) return { value: isMap ? {} : [], end: i + 1 };
  const items = [];
  for (;;) {
    i = skipFlowWs(s, i);
    if (i >= s.length) throw new Error("unterminated flow collection");
    let key;
    if (isMap) {
      const k = readFlowToken(s, i, [":"]);
      key = k.text.trim().replace(/^["']|["']$/g, "");
      i = skipFlowWs(s, k.end + 1);
    }
    let value;
    if (s[i] === "{" || s[i] === "[") {
      const nested = readFlowCollection(s, i);
      value = nested.value; i = nested.end;
    } else {
      const v = readFlowToken(s, i, [",", close]);
      value = scalar(v.text);
      i = v.end;
    }
    items.push(isMap ? [key, value] : value);
    i = skipFlowWs(s, i);
    if (s[i] === ",") { i = skipFlowWs(s, i + 1); if (s[i] === close) { i++; break; } continue; }
    if (s[i] === close) { i++; break; }
    throw new Error(`expected ',' or '${close}'`);
  }
  const value = isMap ? Object.fromEntries(items) : items.filter((v) => v !== "");
  return { value, end: i };
}

function skipFlowWs(s, i) {
  while (i < s.length && /\s/.test(s[i])) i++;
  return i;
}

// Reads raw text from `i` up to (but not including) the first unquoted occurrence of a char in
// `stopChars`, honoring both quote styles so a stop char inside quotes stays text. Throws (never
// returns a partial token) when the string runs out before a stop char is found outside quotes,
// which is what an unbalanced bracket or an unterminated quote looks like from here.
function readFlowToken(s, i, stopChars) {
  let text = "";
  let q = null;
  while (i < s.length) {
    const ch = s[i];
    if (q) { text += ch; if (ch === q) q = null; i++; continue; }
    if (ch === '"' || ch === "'") { q = ch; text += ch; i++; continue; }
    if (stopChars.includes(ch)) return { text, end: i };
    text += ch; i++;
  }
  throw new Error("unterminated flow token");
}

function foldLines(lines) {
  let s = "";
  for (const l of lines) {
    if (!l.trim()) s += "\n";
    else s += (s && !s.endsWith("\n") ? " " : "") + l.trim();
  }
  return s;
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
