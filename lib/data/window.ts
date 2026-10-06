// Shared trailing-window resolution for rate/APR figures.
//
// A window boundary must come from a REAL timestamp, never from a nominal block time.
// Shannon's ~60s is a target, not a guarantee, and an annualised rate divides by the window length —
// a few percent of block-time drift becomes a few percent of wrong APR, silently.

/**
 * `[now − days, now)` for the money catalog functions (getDelegatorIncomeJson, getValidatorRewardsJson),
 * which take the window as timestamps and resolve the blocks themselves. `now` is rounded down to
 * `stepSeconds` so the request — and with it the fetch-cache key — stays the same for that long.
 *
 * The catalog raises for a range that starts before its first written settlement (mainnet: March
 * 2026 as of 2026-10-06, moving toward genesis; beta: genesis). Once pocketdex's range contract is
 * deployed it answers from there instead, and says where it starts (lib/data/range.ts). A trailing
 * 30-day window starts well inside it either way.
 */
/** Shortest active span (days of settlements inside the window) an APR is quoted for. */
export const MIN_SPAN_DAYS = 7;
/** What a rate shows below MIN_SPAN_DAYS, and why. */
export const STILL_PROCESSING = 'Still processing';
export const STILL_PROCESSING_HINT = 'Less than a week of settlements in the last 30 days — too little data for an annual rate.';
/** Tooltip on the "—" a delegator's rate shows when the start of its delegation could not be read. */
export const START_UNKNOWN_HINT = 'Couldn’t determine when this delegation started.';
/** What a validator's rate shows below MIN_SPAN_DAYS when it has stopped settling (last settlement over a day old). */
export const INACTIVE = 'Inactive';
export const INACTIVE_HINT =
  'Last settlement over a day behind the network’s latest settlement, and less than a week of settlements in the last 30 days.';
/** Tooltip on a rate quoted for a validator that has stopped settling. */
export const STOPPED_HINT =
  'Last settlement over a day behind the network’s latest settlement; the rate covers its active days only.';

/** Round a window in days to something a label can say without implying false precision. */
export function windowLabel(days: number): string {
  if (days >= 1.5) return `${Math.round(days)}d`;
  return `${Math.max(1, Math.round(days * 24))}h`;
}

export function trailingRange(days: number, stepSeconds: number): { rangeStart: string; rangeEnd: string } {
  const step = stepSeconds * 1000;
  const end = Math.floor(Date.now() / step) * step;
  return { rangeStart: new Date(end - days * 86_400_000).toISOString(), rangeEnd: new Date(end).toISOString() };
}
