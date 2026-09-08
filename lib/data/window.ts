import { gqlFetch } from '@/lib/graphql';
import { toDate } from '@/lib/time';
import type { NetworkId } from '@/lib/networks';

// Shared trailing-window resolution for rate/APR figures.
//
// A window boundary must come from a REAL block timestamp, never from a nominal block time.
// Shannon's ~60s is a target, not a guarantee, and an annualised rate divides by the window length —
// a few percent of block-time drift becomes a few percent of wrong APR, silently.

const WINDOW_START_BLOCK = /* GraphQL */ `
  query windowStartBlock($cutoff: Datetime!) {
    blocks(first: 1, orderBy: ID_DESC, filter: { timestamp: { lessThanOrEqualTo: $cutoff } }) {
      nodes {
        id
        timestamp
      }
    }
  }
`;

export interface WindowStart {
  height: string;
  timestamp: string;
}

/**
 * The newest block at or before `days` ago. Null when the indexer can't answer, which callers
 * should treat as "no rate available" rather than falling back to an assumed block time.
 */
export async function resolveWindowStart(network: NetworkId, days: number): Promise<WindowStart | null> {
  const cutoff = new Date(Date.now() - days * 86_400_000);
  // Indexer timestamps are UTC-naive ("2026-07-30T17:59:36.047"), so send the cutoff the same way —
  // a trailing Z is read as a different instant.
  const iso = cutoff.toISOString().replace('Z', '');
  try {
    const d = await gqlFetch<{ blocks: { nodes: { id: string; timestamp: string }[] } }>(
      network,
      WINDOW_START_BLOCK,
      { cutoff: iso },
      { revalidate: 300 },
    );
    const n = d.blocks.nodes[0];
    // The block's height comes back as `id`; callers want it named `height`. Returning the node
    // as-is would leave `height` undefined, which reaches the next query as a null variable and
    // gets rejected with a bare 400 — silent, because callers treat a failed window as "no rate".
    return n ? { height: n.id, timestamp: n.timestamp } : null;
  } catch {
    return null;
  }
}

// Timestamps for an explicit set of block heights. Grouped aggregates can only hand back the
// min/max blockId that bracket a validator's activity, and turning those heights into an elapsed
// span with a nominal block time is exactly the drift this module exists to avoid — so resolve
// them. One query for the whole set: boundary heights repeat heavily across validators.
const BLOCK_TIMESTAMPS = /* GraphQL */ `
  query blockTimestamps($ids: [BigFloat!]) {
    blocks(filter: { id: { in: $ids } }) {
      nodes {
        id
        timestamp
      }
    }
  }
`;

/**
 * Map of block height → epoch millis for the given heights. Heights that the indexer cannot
 * resolve are simply absent; callers should treat a missing height as "no rate available".
 */
export async function resolveBlockTimestamps(
  network: NetworkId,
  heights: (string | null | undefined)[],
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const ids = [...new Set(heights.filter((h): h is string => !!h))];
  if (ids.length === 0) return out;
  try {
    const d = await gqlFetch<{ blocks: { nodes: { id: string; timestamp: string }[] } }>(
      network,
      BLOCK_TIMESTAMPS,
      { ids },
      { revalidate: 300 },
    );
    for (const n of d.blocks.nodes) {
      const ms = toDate(n.timestamp)?.getTime();
      if (ms != null) out.set(String(n.id), ms);
    }
  } catch {
    /* callers treat an unresolved height as "no rate" */
  }
  return out;
}
