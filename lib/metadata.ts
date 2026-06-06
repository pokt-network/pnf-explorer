import { gqlFetch } from './graphql';
import { INDEXER_LAG_THRESHOLD } from './config';
import { METADATA_QUERY, STATUS_QUERY } from './queries/shared';
import type { FallbackDecision, IndexerMetadata, MetadataResult, StatusResult } from './types';

/** Fetch `_metadata`. Defaults to fresh (no-store) so fallback decisions reflect the head. */
export async function getMetadata(opts?: { cache?: RequestCache }): Promise<IndexerMetadata> {
  const data = await gqlFetch<MetadataResult>(METADATA_QUERY, undefined, {
    cache: opts?.cache ?? 'no-store',
  });
  return data._metadata;
}

/** Fetch the live `status` (latest block + heights). Client polling passes no-store. */
export async function getStatus(opts?: { cache?: RequestCache; signal?: AbortSignal }): Promise<StatusResult> {
  return gqlFetch<StatusResult>(STATUS_QUERY, undefined, {
    cache: opts?.cache ?? 'no-store',
    signal: opts?.signal,
  });
}

/**
 * Pure fallback rule (§2): fall back to LCD/RPC when the indexer's head lags real chain head
 * by more than INDEXER_LAG_THRESHOLD blocks.
 *
 * NOTE (live-verified): this deployment's `_metadata.indexerHealthy` is persistently `false`
 * even when lag is 0 and data is current — so it is NOT a usable trigger here (it would fire
 * the RPC banner on every page). Lag is the authoritative freshness signal and still catches a
 * genuine stall (lastProcessedHeight stops advancing while targetHeight tracks chain head). If
 * the indexer is fully unreachable, getUseRpcData()'s catch forces RPC. `indexerHealthy` and
 * `lastFinalizedVerifiedHeight` (may be null) are retained in the payload but not in the rule.
 */
export function evaluateFallback(metadata: IndexerMetadata): FallbackDecision {
  const lag = metadata.targetHeight - metadata.lastProcessedHeight;
  const useRpc = lag > INDEXER_LAG_THRESHOLD;
  return { useRpc, lag, metadata };
}

/**
 * Decide indexer vs RPC for a server render. If `_metadata` itself can't be read, force RPC
 * so pages still resolve (returns error for the indexer-lagging banner, §11).
 */
export async function getUseRpcData(): Promise<FallbackDecision> {
  try {
    return evaluateFallback(await getMetadata());
  } catch (e) {
    return { useRpc: true, lag: null, metadata: null, error: (e as Error).message };
  }
}
