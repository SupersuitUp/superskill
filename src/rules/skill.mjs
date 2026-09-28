// Level 1, "skill": spec-valid (agentskills.io) and hygienic. Every rule is a pure
// function of the loaded context. A rule returns [] when it has nothing to say.

import { existsSync, statSync } from "node:fs";
import { join, dirname, normalize } from "node:path";
import { readText } from "../context.mjs";
import { defineRules } from "./define.mjs";

const NAME_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const TEXT_EXT = /\.(md|mdx|txt|mjs|cjs|js|ts|py|sh|bash|zsh|rb|json|ya?ml|toml)$/i;
const DATA_DIRS = /^(evals|goldens)\//;
const TEST_FILE = /(^|\/)(tests?|__tests__)\/|(^|\/)test_[^/]*\.py$|_test\.py$|\.test\.[cm]?[jt]s$|\.spec\.[cm]?[jt]s$/;
const IGNORE = "superskill-ignore";
const DATA_URI = /data:[a-z]+\/[a-z0-9+.-]+;base64,[A-Za-z0-9+/=]+/gi;

const f = (severity, message, fix, extra = {}) => ({ severity, message, fix, ...extra });
const FOLD_TOKENS = 5000;
// A hard rule is shouted (NEVER, ALWAYS, MUST) or bolded as a command (**Never ...**).
const HARD_RULE = { test: (l) => /\b(NEVER|ALWAYS|MUST|DO NOT|DON'T|REFUSES?)\b/.test(l) || /\*\*(never|always|do not|don't|refuse)\b/i.test(l) };

/** Body lines tagged with whether they sit inside a code fence. */
function proseLines(body) {
  let fenced = false;
  return body.split("\n").map((line) => {
    if (/^\s*(```|~~~)/.test(line)) { fenced = !fenced; return { line, fenced: true }; }
    return { line, fenced };
  });
}
const normRule = (line) => line.toLowerCase().replace(/[*_`>#-]/g, "").replace(/\s+/g, " ").trim();
const broken = (ctx) => Boolean(ctx.error || ctx.parseError);
const str = (v) => (typeof v === "string" ? v : "");

/** Markdown files that are instructions (not evidence) inside the skill. */
function instructionDocs(ctx) {
  return ctx.files.filter((p) => /\.mdx?$/i.test(p) && !DATA_DIRS.test(p) && p !== "MISSES.md");
}

/** Local link targets in a markdown text, relative to `fromRel`'s folder. */
export function localLinks(text, fromRel) {
  const out = [];
  const re = /\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
  let m;
  while ((m = re.exec(text))) {
    let target = m[1].split("#")[0];
    if (!target || /^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith("/") || target.startsWith("~")) continue;
    try { target = decodeURIComponent(target); } catch {}
    const rel = normalize(join(dirname(fromRel), target)).split("\\").join("/");
    if (rel.startsWith("..")) continue;
    out.push(rel);
  }
  return out;
}

const isFile = (dir, rel) => {
  try { return statSync(join(dir, rel)).isFile(); } catch { return false; }
};

export const skillRules = defineRules([
  {
    id: "frontmatter-valid",
    level: "skill",
    check(ctx) {
      if (ctx.error) return [f("fail", ctx.error, "Add a SKILL.md with YAML frontmatter (name, description).")];
      if (ctx.parseError) return [f("fail", `SKILL.md ${ctx.parseError}`, "Open SKILL.md with a --- fenced YAML block holding name and description.")];
      return [];
    },
  },
  {
    id: "name-format",
    level: "skill",
    check(ctx) {
      if (broken(ctx)) return [];
      const name = str(ctx.data.name);
      if (!name) return [f("fail", "frontmatter has no name", "Add `name:` matching the folder name.")];
      if (name.length > 64 || !NAME_RE.test(name))
        return [f("fail", `name "${name}" is not 1-64 lowercase letters, digits and single hyphens`, "Use lowercase-words-joined-by-single-hyphens, at most 64 characters.")];
      return [];
    },
  },
  {
    id: "name-matches-folder",
    level: "skill",
    check(ctx) {
      if (broken(ctx) || !str(ctx.data.name)) return [];
      if (ctx.data.name !== ctx.folderName)
        return [f("fail", `name "${ctx.data.name}" does not match folder "${ctx.folderName}"`, "Rename the folder or the name so they are identical.")];
      return [];
    },
  },
  {
    id: "name-reserved-words",
    level: "skill",
    check(ctx) {
      if (broken(ctx)) return [];
      const name = str(ctx.data.name).toLowerCase();
      const hit = ["anthropic", "claude"].find((w) => name.includes(w));
      return hit ? [f("fail", `name contains the reserved word "${hit}"`, "Pick a name without \"anthropic\" or \"claude\".")] : [];
    },
  },
  {
    id: "description-length",
    level: "skill",
    check(ctx) {
      if (broken(ctx)) return [];
      const d = str(ctx.data.description).trim();
      if (!d) return [f("fail", "frontmatter has no description", "Add a description that says what the skill does and when to use it.")];
      if (d.length > 1024) return [f("fail", `description is ${d.length} characters (limit 1024)`, "Cut it to 1024 characters or fewer, main use case first.")];
      return [];
    },
  },
  {
    id: "description-has-trigger",
    level: "skill",
    check(ctx) {
      if (broken(ctx)) return [];
      const d = str(ctx.data.description);
      if (!d.trim()) return [];
      if (/\bwhen\b|\btrigger(s|ed)?\b|\bfor requests?\b/i.test(d) || str(ctx.data.when_to_use).trim()) return [];
      return [f("warn", "description never says when to use the skill", "Add a clause like \"Use when ...\" so an agent knows when to load it.")];
    },
  },
  {
    id: "description-no-xml",
    level: "skill",
    check(ctx) {
      if (broken(ctx)) return [];
      const tag = str(ctx.data.description).match(/<\/?[a-zA-Z][^>]*>/);
      return tag
        ? [f("fail", `description contains an XML/HTML tag: ${tag[0]}`, "Remove angle brackets from the description (write a placeholder as {slug} or SLUG, not <slug>); skill descriptions must not contain XML tags.")]
        : [];
    },
  },
  {
    id: "compatibility-length",
    level: "skill",
    check(ctx) {
      if (broken(ctx)) return [];
      const c = str(ctx.data.compatibility);
      return c.length > 500 ? [f("fail", `compatibility is ${c.length} characters (limit 500)`, "Shorten compatibility to 500 characters or fewer.")] : [];
    },
  },
  {
    id: "metadata-string-map",
    level: "skill",
    check(ctx) {
      if (broken(ctx) || !("metadata" in ctx.data)) return [];
      const m = ctx.data.metadata;
      if (m === "") return [];
      if (typeof m !== "object" || Array.isArray(m) || m === null)
        return [f("fail", "metadata is not a map of string keys to string values", "Write metadata as indented `key: value` lines.")];
      const bad = Object.entries(m).filter(([, v]) => typeof v !== "string").map(([k]) => k);
      return bad.length ? [f("fail", `metadata values must be strings: ${bad.join(", ")}`, "Quote each metadata value.")] : [];
    },
  },
  // Length is never a defect on its own. A long skill that is well shaped costs tokens only
  // when it is invoked; what actually breaks is a long skill in the wrong shape. After
  // compaction Claude Code keeps only the first ~5,000 tokens of each invoked skill, so the
  // three rules below check what survives that cut, whether an agent can find its way
  // around, and whether anything is said twice.
  {
    id: "body-size",
    level: "skill",
    check(ctx) {
      if (broken(ctx)) return [];
      const est = Math.round(ctx.body.length / 4);
      if (est <= FOLD_TOKENS) return [];
      const n = ctx.body.replace(/\n+$/, "").split("\n").length;
      return [f("info", `body is ${n} lines, about ${est} tokens; after compaction only the first ~${FOLD_TOKENS} survive`, "Fine if the hard rules sit above that point (see rules-above-the-fold).")];
    },
  },
  {
    id: "rules-above-the-fold",
    level: "skill",
    check(ctx) {
      if (broken(ctx)) return [];
      const fold = FOLD_TOKENS * 4;
      if (ctx.body.length <= fold) return [];
      const above = new Set();
      const late = [];
      let offset = 0;
      let lineNo = 0;
      for (const { line, fenced } of proseLines(ctx.body)) {
        lineNo++;
        const pos = offset;
        offset += line.length + 1;
        if (fenced || !HARD_RULE.test(line)) continue;
        const key = normRule(line);
        if (!key) continue;
        if (pos < fold) above.add(key);
        else if (!above.has(key)) late.push({ lineNo, text: line.trim() });
      }
      if (!late.length) return [];
      const shown = late.slice(0, 3).map((r) => `line ${r.lineNo}: ${r.text.slice(0, 80)}`).join("; ");
      return [f("warn", `${late.length} hard rule(s) sit past the first ~${FOLD_TOKENS} tokens and would not survive compaction (${shown})`, "Restate them in a short Rules section near the top, or move them up. Length is fine; the rules just need to be above the fold. Step-specific detail can move into step files (steps/<step>.md) that are read fresh when the step comes up.")];
    },
  },
  {
    id: "navigable",
    level: "skill",
    check(ctx) {
      if (broken(ctx)) return [];
      const lines = proseLines(ctx.body);
      if (lines.length <= 300) return [];
      let run = 0, worst = 0, worstStart = 0, start = 1, i = 0;
      for (const { line, fenced } of lines) {
        i++;
        if (!fenced && /^#{1,6}\s/.test(line)) { run = 0; start = i + 1; continue; }
        run++;
        if (run > worst) { worst = run; worstStart = start; }
      }
      return worst > 150
        ? [f("warn", `${worst} lines run with no heading (from body line ${worstStart})`, "Break it up with headings, or move a step's detail into its own step file (steps/<step>.md) and leave a pointer that says when to read it: \"Before step 4, read steps/4-reconcile.md.\"")]
        : [];
    },
  },
  {
    id: "no-repeated-paragraphs",
    level: "skill",
    check(ctx) {
      if (broken(ctx)) return [];
      const seen = new Map();
      const dups = [];
      let para = [];
      const flush = () => {
        const text = para.join(" ").toLowerCase().replace(/[*_`>#-]/g, "").replace(/\s+/g, " ").trim();
        para = [];
        if (text.length < 100) return;
        if (seen.has(text)) dups.push(text);
        else seen.set(text, true);
      };
      for (const { line, fenced } of proseLines(ctx.body)) {
        if (fenced) { flush(); continue; }
        if (!line.trim() || /^#{1,6}\s/.test(line)) flush();
        else para.push(line);
      }
      flush();
      return dups.length
        ? [f("warn", `${dups.length} paragraph(s) appear more than once (first: "${dups[0].slice(0, 70)}...")`, "Keep one copy and point to it; two copies drift apart the first time one is edited.")]
        : [];
    },
  },
  {
    id: "references-one-deep",
    level: "skill",
    check(ctx) {
      if (broken(ctx)) return [];
      const out = [];
      const direct = new Set(localLinks(ctx.body, "SKILL.md").filter((p) => isFile(ctx.dir, p)));
      for (const ref of direct) {
        if (!/\.mdx?$/i.test(ref)) continue;
        const text = readText(ctx.dir, ref) || "";
        const chained = localLinks(text, ref).filter((p) => p !== "SKILL.md" && !direct.has(p) && isFile(ctx.dir, p));
        if (chained.length)
          out.push(f("fail", `${ref} links on to ${chained.join(", ")} (references must be one level deep)`, `Link ${chained[0]} directly from SKILL.md, or fold it into ${ref}.`, { file: ref }));
      }
      return out;
    },
  },
  {
    // A step file only works if the agent knows when to open it: a bare link gets skipped
    // or read in part. The pointer line has to carry the condition.
    id: "reference-says-when",
    level: "skill",
    check(ctx) {
      if (broken(ctx)) return [];
      const out = [];
      for (const { line, fenced } of proseLines(ctx.body)) {
        if (fenced) continue;
        for (const target of localLinks(line, "SKILL.md")) {
          if (!/\.mdx?$/i.test(target) || !isFile(ctx.dir, target)) continue;
          const words = line.replace(/\[[^\]]*\]\([^)]*\)/g, " ");
          if (!/\b(when|before|after|if|during|for|to|while|once|read|load|follow)\b/i.test(words))
            out.push(f("warn", `SKILL.md links ${target} without saying when to read it`, `Put the condition on the pointer line: "Before <step>, read ${target}." or "For <case>, see ${target}."`, { file: target }));
        }
      }
      return out;
    },
  },
  {
    id: "long-reference-toc",
    level: "skill",
    check(ctx) {
      if (broken(ctx)) return [];
      const out = [];
      for (const p of instructionDocs(ctx)) {
        // HDSOP.md is Freedom's workflow map, written for a person reviewing the process,
        // not a reference an agent loads in part.
        if (p === "SKILL.md" || p === "HDSOP.md") continue;
        const lines = (readText(ctx.dir, p) || "").split("\n");
        if (lines.length <= 100) continue;
        const head = lines.slice(0, 30);
        const toc = head.some((l) => /contents/i.test(l)) || head.filter((l) => /^\s*[-*]\s*\[[^\]]+\]\(#/.test(l)).length >= 3;
        if (!toc) out.push(f("warn", `${p} is ${lines.length} lines with no table of contents`, "Add a Contents list in the first 30 lines so an agent can jump to the part it needs.", { file: p }));
      }
      return out;
    },
  },
  {
    id: "no-absolute-paths",
    level: "skill",
    check(ctx) {
      if (broken(ctx)) return [];
      const out = [];
      // The path must start the token (not "capture/home/Library") and name something
      // ("/Users/..." as a placeholder in prose is not a path).
      const re = /(^|[\s"'`(=:,[{<])(\/Users\/[A-Za-z0-9_]|\/home\/[A-Za-z0-9_]|[A-Z]:\\{1,2}[A-Za-z])/;
      for (const p of ctx.files) {
        // Tests use fake machine paths as data; they are not paths the skill depends on.
        if (!TEXT_EXT.test(p) || DATA_DIRS.test(p) || TEST_FILE.test(p)) continue;
        const lines = (readText(ctx.dir, p) || "").split("\n");
        const hits = [];
        lines.forEach((l, i) => { if (re.test(l) && !l.includes(IGNORE)) hits.push(i + 1); });
        if (hits.length)
          out.push(f("fail", `${p}:${hits[0]} hard-codes a machine path${hits.length > 1 ? ` (${hits.length} lines)` : ""}`, "Use a path relative to the skill folder, ~, or an environment variable.", { file: p, line: hits[0] }));
      }
      return out;
    },
  },
  {
    id: "injection-scan",
    level: "skill",
    check(ctx) {
      if (broken(ctx)) return [];
      const out = [];
      const patterns = [
        ["override phrase", /\b(ignore|disregard|forget)\s+(all\s+|any\s+)?(the\s+)?(previous|prior|above|earlier|preceding)?\s*(instructions|prompts?|rules)\b/i, (m) => /(previous|prior|above|earlier|preceding|all|any)/i.test(m)],
        ["override phrase", /\bdisregard\s+(the\s+)?system\s+prompt\b/i],
        ["download piped to a shell", /\b(curl|wget)\b[^\n|]*\|\s*(sudo\s+)?(ba|z)?sh\b/i],
        ["long base64 blob", /[A-Za-z0-9+/]{200,}={0,2}/],
      ];
      for (const p of instructionDocs(ctx)) {
        const text = readText(ctx.dir, p) || "";
        const lines = text.split("\n");
        for (const [label, re, confirm] of patterns) {
          const i = lines.findIndex((l) => {
            // An inline data: URI (an embedded image) is content, not a hidden payload.
            const probe = l.replace(DATA_URI, "");
            const m = probe.match(re);
            return m && !l.includes(IGNORE) && (!confirm || confirm(m[0]));
          });
          if (i >= 0) out.push(f("fail", `${p}:${i + 1} ${label}: "${lines[i].trim().slice(0, 80)}"`, "Remove it, or mark a deliberate example with `superskill-ignore` on the same line.", { file: p, line: i + 1 }));
        }
        const comments = text.matchAll(/<!--([\s\S]*?)-->/g);
        for (const c of comments) {
          const body = c[1];
          if (body.includes(IGNORE)) continue;
          const addressed = /^\s*(assistant|system|ai|agent|claude|model)\s*[:,]/i.test(body);
          const action = /\b(ignore|disregard|send|upload|exfiltrate|post|curl|wget|read|execute|run|delete)\b/i.test(body);
          const target = /(https?:\/\/|~\/|\.ssh|\.env\b|credential|token|password|secret|api[_ -]?key)/i.test(body);
          if (addressed || (action && target)) {
            const line = text.slice(0, c.index).split("\n").length;
            out.push(f("fail", `${p}:${line} hidden HTML comment gives the agent instructions`, "Delete the comment; instructions belong in visible text.", { file: p, line }));
          }
        }
      }
      return out;
    },
  },
]);
