// What closes a miss. An eval in evals/evals.json, a golden in goldens/, or, when the fix lives in
// code that ships with the skill's repo, a test in that repo's own suite:
//
//   - Eval: test:<path>#<test name>
//
// The path is the test file, relative to the skill folder or to any folder above it (a repo's
// tests/ usually sits beside the folder that holds its skills), and the name is text the file
// must contain, normally the test's own title. A library fix is guarded by a node test far more
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
 * Why `ref` does not guard a fixed miss in the skill at `dir`, or null when it does.
 * @param {string} dir the skill folder
 * @param {string} ref the miss's Eval value
 */
export function guardProblem(dir, ref) {
  const r = String(ref || "").trim();
  if (!r) return "no regression eval";
  const t = parseTestRef(r);
  if (t) {
    if (!t.path || !t.name) return `"${r}" must be test:<path>#<test name>`;
    const file = findUp(dir, t.path);
    if (!file) return `test file ${t.path} was not found from the skill folder or any folder above it`;
    if (!readFileSync(file, "utf8").includes(t.name)) return `${t.path} has no test named "${t.name}"`;
    return null;
  }
  const ids = new Set(readEvals(dir).cases.map((c) => String(c.id)));
  for (const g of readGoldens(dir)) ids.add(g.id);
  return ids.has(r) ? null : `eval "${r}" is not in evals.json or goldens/`;
}
