// Where a skill folder's source lives, for the retro's ownership decision.
//
// Three shapes, in the order they are tried:
//   - an installed plugin copy: a folder under a `.claude-plugin/plugin.json` that is not itself a
//     git checkout, so editing it is pointless. Its source is the plugin's `repository`.
//   - a git checkout: its `origin` remote, when that is a GitHub repo; with no remote it is this
//     person's own.
//   - anything else: a loose folder on this person's machine, so it is theirs.
// Push access is asked of GitHub through `gh` only when network is allowed; without it a repo's
// owner is unknown, which the retro treats as not theirs.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";

/** "owner/name" from owner/name or a GitHub https/ssh URL, else null. */
export function parseRepo(s) {
  const v = String(s || "").trim();
  const m = /^(?:git\+)?(?:https?:\/\/|ssh:\/\/git@)?(?:www\.)?github\.com[/:]([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/i.exec(v)
    || /^git@github\.com:([\w.-]+)\/([\w.-]+?)(?:\.git)?$/i.exec(v)
    || /^([\w.-]+)\/([\w.-]+?)$/.exec(v);
  return m ? `${m[1]}/${m[2]}` : null;
}

const git = (cwd, args) => {
  try { return execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); }
  catch { return null; }
};

function pluginManifest(dir) {
  for (let d = dir; ; d = dirname(d)) {
    const p = join(d, ".claude-plugin", "plugin.json");
    if (existsSync(p)) { try { return JSON.parse(readFileSync(p, "utf8")); } catch { return {}; } }
    if (dirname(d) === d) return null;
  }
}

const readJson = (p) => { try { return JSON.parse(readFileSync(p, "utf8")); } catch { return null; } };

/**
 * An installed copy under <plugins>/cache/<marketplace>/<plugin>/<version>/ whose plugin.json names
 * no repository: its marketplace knows. The catalog entry's own GitHub source first, else the
 * marketplace's (a "github" marketplace is its repo; a "directory" one is that folder's origin, or
 * the person's own when it has none, and that folder is where the fix goes).
 */
export function marketplaceSource(dir, pluginsRoot = process.env.SUPERSKILL_PLUGINS_ROOT || join(process.env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude"), "plugins")) {
  const m = /[\\/]cache[\\/]([^\\/]+)[\\/]([^\\/]+)[\\/]/.exec(dir);
  if (!m) return null;
  const [, market, plugin] = m;
  const catalog = readJson(join(pluginsRoot, "marketplaces", market, ".claude-plugin", "marketplace.json"));
  const entry = catalog?.plugins?.find((p) => p.name === plugin);
  const src = entry?.source;
  if (src && typeof src === "object") {
    const repo = parseRepo(src.repo || src.url);
    if (repo) return { kind: "repo", repo, installedCopy: true };
  }
  const known = readJson(join(pluginsRoot, "known_marketplaces.json"))?.[market]?.source;
  if (known?.source === "github" && parseRepo(known.repo)) return { kind: "repo", repo: parseRepo(known.repo), installedCopy: true };
  if (known?.source === "directory" && known.path) {
    const url = git(known.path, ["remote", "get-url", "origin"]);
    const repo = parseRepo(url);
    // With a remote, that folder may be a read-only channel copy, so the fix goes to the repo, not
    // to the folder; with none, the folder is the only source there is.
    return repo ? { kind: "repo", repo, installedCopy: true } : { kind: "own", checkout: known.path };
  }
  return null;
}

/** { kind, repo?, installedCopy?, say? } for a skill folder, without touching the network. */
export function locate(skillDir) {
  let dir = skillDir;
  try { dir = realpathSync(skillDir); } catch {}
  const top = git(dir, ["rev-parse", "--show-toplevel"]);
  const manifest = pluginManifest(dir);
  if (!top && manifest) {
    const raw = typeof manifest.repository === "string" ? manifest.repository : manifest.repository?.url;
    const repo = parseRepo(raw);
    if (repo) return { kind: "repo", repo, installedCopy: true };
    return marketplaceSource(dir)
      || { kind: "unknown", say: `${dir} is an installed plugin copy, and neither its plugin.json nor its marketplace names a repository` };
  }
  if (top) {
    const url = git(top, ["remote", "get-url", "origin"]);
    if (!url) return { kind: "own" };
    const repo = parseRepo(url);
    return repo ? { kind: "repo", repo, installedCopy: false } : { kind: "unknown", say: `its origin (${url}) is not a GitHub repo` };
  }
  return { kind: "own" };
}

/** Ask GitHub whether this person can push to `where.repo`. Mutates and returns `where`. */
export function withPushAccess(where, gh = (args) => execFileSync("gh", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] })) {
  if (where.kind !== "repo") return where;
  try {
    const p = JSON.parse(gh(["api", `repos/${where.repo}`])).permissions || {};
    where.canPush = Boolean(p.push || p.admin);
  } catch {
    where.canPush = null;
    where.say = `gh could not read ${where.repo} (not signed in, no access, or no such repo)`;
  }
  return where;
}
