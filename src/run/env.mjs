// The environment every sandboxed run gets, so a `doctor --run` session is never counted as a
// real use of the skill by whatever is recording real uses.
//
// MEASURED, NOT FEARED (2026-10-05): Freedom's skill ledger records every skill run from a
// harness hook. The doctor's own sandbox runs fired that hook, so three runs of a skill nobody had
// ever used for real landed in the operator's ledger as perfect one-shot runs. Left alone, every
// `doctor --run` raises the number that is meant to keep the doctor honest.
//
// Two signals, because a caller's recorder may honour either: FREEDOM_SKILL_LEDGER=off is the
// Freedom ledger's documented off switch, and SUPERSKILL_SANDBOX=1 names the run for any other
// recorder. The run folder's own name (SANDBOX_PREFIX) is the third, for a recorder that reads
// only the hook payload's cwd.
export const SANDBOX_PREFIX = "superskill-run-";

export function sandboxEnv(base = process.env) {
  return { ...base, FREEDOM_SKILL_LEDGER: "off", SUPERSKILL_SANDBOX: "1" };
}
