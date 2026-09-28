/**
 * Minimal argv parser. `booleans` names flags that never take a value; every other
 * `--flag` consumes the next argument (or `--flag=value`). Positionals land in `_`.
 */
export function parseArgs(argv, booleans = []) {
  const out = { _: [], flags: {} };
  const bools = new Set(["help", "json", ...booleans]);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "-h") { out.flags.help = true; continue; }
    if (!a.startsWith("--") || a === "--") { out._.push(a); continue; }
    const eq = a.indexOf("=");
    const key = a.slice(2, eq > 0 ? eq : undefined);
    if (eq > 0) out.flags[key] = a.slice(eq + 1);
    else if (bools.has(key)) out.flags[key] = true;
    else if (i + 1 < argv.length) out.flags[key] = argv[++i];
    else throw new UsageError(`--${key} needs a value`);
  }
  return out;
}

export class UsageError extends Error {}

/** The clock every date rule reads. SUPERSKILL_NOW pins it for tests and reproducible reports. */
export function clock(flags = {}) {
  const v = flags.now || process.env.SUPERSKILL_NOW;
  const d = v ? new Date(v) : new Date();
  if (Number.isNaN(d.getTime())) throw new UsageError(`not a date: ${v}`);
  return d;
}
