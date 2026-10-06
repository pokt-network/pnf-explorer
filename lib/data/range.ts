import { absoluteUtc } from '@/lib/time';

// The money catalog's range contract. pocketdex's `get…Json` functions answer either the bare rows
// (before its range change is deployed) or `{ range, data }`: the rows plus the span they actually
// cover. Outside its coverage the old shape raised; the new one answers what it has. Every reader
// goes through unwrapRange, so the site works against both deploys.

/** The span a catalog answer covers. Times are ISO strings; `requested_from` is null for an open start,
 *  `covered_from`/`covered_to` are null when nothing in the range is covered. */
export interface CoveredRange {
  requested_from: string | null;
  requested_to: string | null;
  covered_from: string | null;
  covered_to: string | null;
  /** Unwritten settlement stretches inside the covered span: nothing is counted there. A null edge is
   *  read as the covered span's edge. */
  gaps: { from: string | null; to: string | null }[];
}

/**
 * Splits a catalog answer into its data and the range it covers. The old shape (anything but an
 * object with both `range` and `data`) comes back as it is, with `range: null`. `data: null` means
 * nothing in the range is covered — no data, never 0 — and so does a range that covers nothing (no
 * `covered_from`/`covered_to`, or an inverted span), whatever empty value came with it.
 */
export function unwrapRange<T>(x: unknown): { data: T | null; range: CoveredRange | null } {
  if (x == null || typeof x !== 'object' || Array.isArray(x) || !('range' in x) || !('data' in x)) {
    return { data: (x ?? null) as T | null, range: null };
  }
  const range = x.range as CoveredRange;
  const empty = range.covered_from == null || range.covered_to == null || Date.parse(range.covered_from) > Date.parse(range.covered_to);
  return { data: empty ? null : ((x.data ?? null) as T | null), range };
}

/** What a reader answers, instead of a figure, when the catalog has no data for its window at all. */
export const NOT_COVERED = 'not-covered';

/** The part of a requested window the catalog covered, epoch ms: `[from, to)` minus `gaps` (merged, inside it). */
export interface CoveredWindow {
  from: number;
  to: number;
  gaps: { from: number; to: number }[];
}

/**
 * The window a figure read over `[from, to)` is measured against: narrowed to the covered span, with
 * the gaps clipped to it and merged. A gap at either edge narrows the window instead of staying a
 * gap. The old shape (`range` null) covers the whole request; null when nothing is covered.
 */
export function coveredWindow(range: CoveredRange | null, from: number, to: number): CoveredWindow | null {
  if (!range) return { from, to, gaps: [] };
  if (range.covered_from == null || range.covered_to == null) return null;
  let f = Math.max(from, Date.parse(range.covered_from));
  let t = Math.min(to, Date.parse(range.covered_to));
  const gaps: { from: number; to: number }[] = [];
  const clipped = (range.gaps ?? [])
    .map((g) => ({ from: Math.max(g.from == null ? f : Date.parse(g.from), f), to: Math.min(g.to == null ? t : Date.parse(g.to), t) }))
    .filter((g) => g.to > g.from)
    .sort((a, b) => a.from - b.from);
  for (const g of clipped) {
    const last = gaps[gaps.length - 1];
    if (last && g.from <= last.to) last.to = Math.max(last.to, g.to);
    else gaps.push({ ...g });
  }
  if (gaps.length > 0 && gaps[0].from <= f) f = gaps.shift()!.to;
  if (gaps.length > 0 && gaps[gaps.length - 1].to >= t) t = gaps.pop()!.from;
  return t > f ? { from: f, to: t, gaps } : null;
}

/** Milliseconds of `[a, b)` the window has data for: inside it, and outside its gaps. */
export function coveredMs(w: CoveredWindow, a: number, b: number): number {
  const lo = Math.max(a, w.from);
  const hi = Math.min(b, w.to);
  if (!(hi > lo)) return 0;
  let gap = 0;
  for (const g of w.gaps) gap += Math.max(0, Math.min(hi, g.to) - Math.max(lo, g.from));
  return hi - lo - gap;
}

/** An end short of the request by less than this is the indexer's normal lag behind the newest block, not missing data. */
const END_SLACK_MS = 3_600_000;

/**
 * The quiet note under a figure read over a partly covered range: where the data starts and ends when
 * that is not where the request did, and any gaps inside. Null for the old shape, a fully covered
 * range, and a range with nothing covered (callers show their no-data state for that).
 */
export function coverageNote(range: CoveredRange | null): string | null {
  if (!range) return null;
  const reqFrom = range.requested_from == null ? -Infinity : Date.parse(range.requested_from);
  const reqTo = range.requested_to == null ? Infinity : Date.parse(range.requested_to);
  const w = coveredWindow(range, reqFrom, reqTo);
  if (!w) return null;
  // Likewise an open start begins with the oldest data.
  const since = range.requested_from != null && w.from > reqFrom ? absoluteUtc(w.from) : null;
  // An open end runs to the newest data by definition: nothing to say about it.
  const until = range.requested_to != null && w.to < reqTo - END_SLACK_MS ? absoluteUtc(w.to) : null;
  const parts: string[] = [];
  if (since && until) parts.push(`Data from ${since} to ${until}`);
  else if (since) parts.push(`Data since ${since}`);
  else if (until) parts.push(`Data until ${until}`);
  if (w.gaps.length > 0) parts.push(`gaps: ${w.gaps.map((g) => `${absoluteUtc(g.from)} – ${absoluteUtc(g.to)}`).join(', ')}`);
  return parts.length > 0 ? parts.join(' · ') : null;
}
