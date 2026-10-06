import { absoluteUtc } from '@/lib/time';

// The money catalog's range contract. pocketdex's `get…Json` functions answer either the bare rows
// (before its range change is deployed) or `{ range, data }`: the rows plus the span they actually
// cover. Outside its coverage the old shape raised; the new one answers what it has. Every reader
// goes through unwrapRange, so the site works against both deploys.

/** The span a catalog answer covers. Times are ISO strings; `requested_from` is null for an open start. */
export interface CoveredRange {
  requested_from: string | null;
  requested_to: string | null;
  covered_from: string | null;
  covered_to: string | null;
  /** Unwritten settlement stretches inside the covered span: nothing is counted there. */
  gaps: { from: string; to: string }[];
}

/**
 * Splits a catalog answer into its data and the range it covers. The old shape (anything but an
 * object with both `range` and `data`) comes back as it is, with `range: null`. `data: null` means
 * nothing in the range is covered — no data, never 0 — and a range that covers nothing reads as
 * null too, whatever empty value the function answered with (`[]` for the `…Json` rows).
 */
export function unwrapRange<T>(x: unknown): { data: T | null; range: CoveredRange | null } {
  if (x == null || typeof x !== 'object' || Array.isArray(x) || !('range' in x) || !('data' in x)) {
    return { data: (x ?? null) as T | null, range: null };
  }
  const range = x.range as CoveredRange;
  const empty = range.covered_from != null && range.covered_to != null && Date.parse(range.covered_from) > Date.parse(range.covered_to);
  return { data: empty ? null : ((x.data ?? null) as T | null), range };
}

/** Start of the covered span when it is later than the start asked for, else null (old shape, or fully covered). */
export function coveredSince(range: CoveredRange | null): number | null {
  if (!range?.covered_from) return null;
  const from = Date.parse(range.covered_from);
  return range.requested_from == null || from > Date.parse(range.requested_from) ? from : null;
}

/** The quiet note under a figure read over a partly covered range: "Data since …" and any gaps. Null when there is nothing to say. */
export function coverageNote(range: CoveredRange | null): string | null {
  if (!range) return null;
  const parts: string[] = [];
  const since = coveredSince(range);
  if (since != null) parts.push(`Data since ${absoluteUtc(since)}`);
  if (range.gaps.length > 0) parts.push(`gaps: ${range.gaps.map((g) => `${absoluteUtc(g.from)} – ${absoluteUtc(g.to)}`).join(', ')}`);
  return parts.length > 0 ? parts.join(' · ') : null;
}
