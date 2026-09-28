/** Wrap rule definitions so every finding a check returns names its rule. */
export function defineRules(rules) {
  return rules.map((r) => ({
    ...r,
    check(ctx, opts = {}) {
      return (r.check(ctx, opts) || []).map((x) => ({ rule: r.id, ...x }));
    },
  }));
}
