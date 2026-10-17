// GraphQL's Int is 32-bit: a page whose offset is past it fails the whole request.
const GRAPHQL_INT_MAX = 2147483647;

/**
 * Parse a `?page=`-style search param: "2" → 2; absent/garbage/negative → 1; a fraction is floored ("2.7" → 2). With
 * `pageSize`, the page is also capped so its offset fits GraphQL's Int.
 */
export function parsePage(v: string | undefined, pageSize?: number): number {
  const page = Math.max(1, Math.floor(Number(v)) || 1);
  return pageSize ? Math.min(page, Math.floor(GRAPHQL_INT_MAX / pageSize)) : page;
}
