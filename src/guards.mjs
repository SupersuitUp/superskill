// What closes a miss. An eval in evals/evals.json, a golden in goldens/, or, when the fix lives in
// code that ships with the skill's repo, a test in that repo's own suite:
//
//   - Eval: test:<path>#<test name>
//
// The path is the test file, relative to the skill folder or to any folder above it (a repo's
// tests/ usually sits beside the folder that holds its skills), and the name is text the file's
// code must contain, normally the test's own title or a literal part of it. Comments and import
// lines do not count, and a title built at run time (a template literal) matches its run-time
// name with each `${...}` read as any text (ContinentalWorks/supersuit-dev#4002). A library fix is guarded by a node test far more
// often than by a model eval, and with no syntax for it authors wrote the path anyway and the
// doctor failed the miss (ContinentalWorks/supersuit-dev#1310).
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { readEvals } from "./evals.mjs";
import { readGoldens } from "./goldens.mjs";

export const TEST_PREFIX = "test:";

/** `{ path, name }` for a `test:` reference, or null when it is not one. */
export function parseTestRef(ref) {
  const s = String(ref || "").trim();
  if (!s.startsWith(TEST_PREFIX)) return null;
  const body = s.slice(TEST_PREFIX.length);
  const hash = body.indexOf("#");
  const path = (hash === -1 ? body : body.slice(0, hash)).trim();
  const name = hash === -1 ? "" : body.slice(hash + 1).trim().replace(/^["'](.*)["']$/, "$1");
  return { path, name };
}

/** The test file a relative path names, searched from the skill folder upward, or null. */
function findUp(dir, path) {
  if (isAbsolute(path)) return existsSync(path) ? path : null;
  let d = resolve(dir);
  for (;;) {
    const p = join(d, path);
    try { if (statSync(p).isFile()) return p; } catch { /* not here */ }
    const up = dirname(d);
    if (up === d) return null;
    d = up;
  }
}

/**
 * The file's code with its comments and import lines taken out, and the bodies of its template
 * literals. A small scanner rather than a regex, so `//` inside a string (a URL in a title) stays.
 * Python files (`.py`) take `#` as the comment mark; everything else takes `//` and block comments.
 */
export function codeOf(source, file = "") {
  const src = String(source || "");
  const py = /\.py$/i.test(file);
  let out = "";
  const templates = [];
  for (let i = 0; i < src.length;) {
    const c = src[i], n = src[i + 1];
    if (py && c === "#") { while (i < src.length && src[i] !== "\n") i++; continue; }
    if (!py && c === "/" && n === "/") { while (i < src.length && src[i] !== "\n") i++; continue; }
    if (!py && c === "/" && n === "*") { const e = src.indexOf("*/", i + 2); i = e === -1 ? src.length : e + 2; continue; }
    if (c === "'" || c === '"' || c === "`") {
      const triple = py && src.startsWith(c.repeat(3), i);
      const close = triple ? c.repeat(3) : c;
      let j = i + close.length;
      while (j < src.length && !src.startsWith(close, j)) {
        if (src[j] === "\\") j++;
        else if (!triple && c !== "`" && src[j] === "\n") break;
        j++;
      }
      const body = src.slice(i + close.length, j);
      if (c === "`") templates.push(body);
      out += close + body + close;
      i = Math.min(src.length, j + close.length);
      continue;
    }
    out += c;
    i++;
  }
  const code = out.split("\n").filter((l) => !/^\s*(import\b|export\s.*\bfrom\b|from\s+\S+\s+import\b)|\brequire\s*\(/.test(l)).join("\n");
  return { code, templates };
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * True when `name` is in the test file's code (not a comment, not an import line), or is the
 * run-time text of one of its template literals, each `${...}` read as any text.
 */
export function namesTest(source, name, file = "") {
  const n = String(name || "");
  if (!n) return false;
  const { code, templates } = codeOf(source, file);
  if (code.includes(n)) return true;
  return templates.some((t) => {
    const parts = t.split(/\$\{[^}]*\}/);
    return parts.length > 1 && new RegExp(`^${parts.map(escapeRe).join("[\\s\\S]*?")}$`).test(n);
  });
}

const NO_TEST = (path, name) => `${path} has no test named "${name}": pass the test's title, or a literal part of a title built at run time; text in a comment or an import line does not count`;

/**
 * Why `ref` does not guard a fixed miss in the skill at `dir`, or null when it does.
 * @param {string} dir the skill folder
 * @param {string} ref the miss's Eval value
 */
export function guardProblem(dir, ref, { strict = true } = {}) {
  const r = String(ref || "").trim();
  if (!r) return "no regression eval";
  const t = parseTestRef(r);
  if (t) {
    if (!t.path || !t.name) return `"${r}" must be test:<path>#<test name>`;
    const file = findUp(dir, t.path);
    if (!file) return `test file ${t.path} was not found from the skill folder or any folder above it`;
    const source = readFileSync(file, "utf8");
    if (namesTest(source, t.name, file)) return null;
    // Not strict: a miss closed before 0.11.1 by text anywhere in the file still passes here, and
    // guardWeakness() says so as a warning. `superskill fix` is always strict.
    if (!strict && source.includes(t.name)) return null;
    return NO_TEST(t.path, t.name);
  }
  const ids = new Set(readEvals(dir).cases.map((c) => String(c.id)));
  for (const g of readGoldens(dir)) ids.add(g.id);
  return ids.has(r) ? null : `eval "${r}" is not in evals.json or goldens/`;
}

/**
 * A warning for a `test:` guard that passes only because its name sits in a comment or an import
 * line (a miss closed before 0.11.1), or null. It does not fail the skill: that miss was closed
 * under the older rule.
 */
export function guardWeakness(dir, ref) {
  if (!parseTestRef(ref)) return null;
  return guardProblem(dir, ref, { strict: false }) === null ? guardProblem(dir, ref) : null;
}
