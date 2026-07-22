/** Parse a `?page=`-style search param: "2" → 2; absent/garbage/negative → 1. */
export function parsePage(v: string | undefined): number {
  return Math.max(1, Number(v) || 1);
}
