import { nextLevel, LEVELS } from "./levels.mjs";
import { pluginLines } from "./commands/collection.mjs";

/** Human-readable doctor report: level, what to fix now, and the to-do list for the next level. */
export function formatDoctor(result) {
  const lines = [];
  for (const s of result.skills) {
    lines.push(`${s.name}  level: ${s.level}`);
    lines.push(`  ${s.path}`);
    // fails never sit at or below the reached level, so they all belong to the to-do list
    const shown = s.findings.filter((f) => f.severity !== "fail");
    for (const f of shown) lines.push(`  ${f.severity.padEnd(4)}  ${f.rule}: ${f.message}`);
    const up = nextLevel(s.level);
    if (up && s.next.length) {
      lines.push(`  to reach ${up}:`);
      for (const f of s.next) lines.push(`    - ${f.rule}: ${f.message}\n      fix: ${f.fix}`);
    } else if (!up) lines.push("  top level reached");
    lines.push("");
  }
  const counts = Object.fromEntries(["none", ...LEVELS].map((l) => [l, 0]));
  for (const s of result.skills) counts[s.level]++;
  const summary = ["superskill", "tested", "skill", "none"].filter((l) => counts[l]).map((l) => `${counts[l]} ${l}`).join(", ");
  if (result.plugin) lines.push(...pluginLines(result.plugin, result.plugin.superplugin), "");
  lines.push(`${result.skills.length} skill${result.skills.length === 1 ? "" : "s"}: ${summary}. target ${result.target}: ${result.ok ? "met" : "not met"}`);
  return lines.join("\n") + "\n";
}

