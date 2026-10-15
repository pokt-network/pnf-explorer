import { getNetwork, type NetworkId } from './networks';
import { DataError } from './errors';

export type RevalidateOpt = number | false;

export interface GqlOptions {
  /** ISR revalidate seconds, or `false` for immutable/force-cache (§3). Server-side only. */
  revalidate?: RevalidateOpt;
  /** Override fetch cache mode (e.g. 'no-store' for client polling / live heartbeat). */
  cache?: RequestCache;
  signal?: AbortSignal;
  /** Top-level fields (aliases) whose errors are tolerated: the answer comes back with them null and the error is
   *  logged. An error on any other field still throws. */
  partial?: string[];
}

/**
 * Typed POST to a network's GraphQL indexer with a per-call cache policy (§3 — no global default).
 * `network` selects the endpoint (registry in `lib/networks.ts`) and keeps ISR cache keys distinct.
 * Pass `revalidate` for ISR/immutable data; pass `cache:'no-store'` for live client polling.
 */
export async function gqlFetch<T>(
  network: NetworkId,
  query: string,
  variables?: Record<string, unknown>,
  opts: GqlOptions = {},
): Promise<T> {
  const init: RequestInit & { next?: { revalidate?: RevalidateOpt } } = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
    signal: opts.signal,
  };

  if (opts.cache) {
    init.cache = opts.cache;
  } else if (opts.revalidate === false) {
    init.cache = 'force-cache';
  } else if (typeof opts.revalidate === 'number') {
    init.next = { revalidate: opts.revalidate };
  }

  let res: Response;
  try {
    res = await fetch(getNetwork(network).graphql, init);
  } catch (e) {
    throw new DataError(`Network error reaching the indexer: ${(e as Error).message}`, 'network');
  }

  if (!res.ok) {
    const denyReason = res.headers.get('x-deny-reason') ?? undefined;
    // A GraphQL validation error (bad variable, unknown field) comes back as 400 WITH the reason in
    // the body. Read it — throwing on status alone turns a one-line "variable $x of non-null type
    // was not provided" into an unattributable 400.
    let detail = '';
    try {
      const body = (await res.json()) as { errors?: { message: string }[] };
      if (body.errors?.length) detail = `: ${body.errors.map((e) => e.message).join('; ')}`;
    } catch {
      /* non-JSON body — status alone is all we get */
    }
    throw new DataError(
      denyReason ? `Indexer request denied: ${denyReason}` : `Indexer responded ${res.status}${detail}`,
      'server',
      res.status,
      denyReason,
    );
  }

  const json = (await res.json()) as { data?: T; errors?: { message: string; path?: (string | number)[] }[] };
  if (json.errors?.length) {
    const tolerated = opts.partial ?? [];
    const fatal = json.errors.filter((e) => !(e.path && tolerated.includes(String(e.path[0]))));
    if (fatal.length > 0 || json.data == null) {
      throw new DataError(json.errors.map((e) => e.message).join('; '), 'graphql');
    }
    console.error(`Indexer partial answer, ${json.errors.map((e) => `${(e.path ?? []).join('.')}: ${e.message}`).join('; ')}`);
  }
  return json.data as T;
}
