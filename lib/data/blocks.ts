import { gqlFetch } from '@/lib/graphql';
import { rpcFetch } from '@/lib/lcd';
import { INDEXER_LAG_THRESHOLD } from '@/lib/config';
import type { NetworkId } from '@/lib/networks';
import { BLOCK_BY_HASH, BLOCK_BY_HEIGHT, BLOCK_LIST, BLOCK_SUPPLIES, BLOCK_SUMMARY } from '@/lib/queries/blocks';
import { TRANSACTIONS_BY_HEIGHT } from '@/lib/queries/transactions';
import type { FallbackDecision } from '@/lib/types';
import { unwrapRange } from '@/lib/data/range';
import { roundedNow } from '@/lib/data/window';

const HEX64 = /^[0-9a-fA-F]{64}$/;

export interface SupplyNode {
  supply: { denom: string; amount: string };
}
export interface BlockRow {
  height: string;
  hash: string;
  timestamp: string;
  totalTxs: number;
  timeToBlock: number | null;
  successfulTxs: number;
  stakedApps: number;
  stakedSuppliers: number;
  stakedGateways: number;
  totalRelays: string | null;
  totalComputedUnits: string | null;
  proposerAddress: string;
  size: number | null;
  supplies?: { nodes: SupplyNode[] };
}
export interface BlockDetail extends BlockRow {
  stakedAppsTokens?: string | null;
  stakedSuppliersTokens?: string | null;
  stakedGatewaysTokens?: string | null;
  metadata?: { header: unknown; lastCommit: unknown; blockId: unknown } | null;
  source: 'indexer' | 'rpc';
}
export interface BlockTx {
  id: string;
  code: number;
  // The height is the row's own; the timestamp is null transiently for a tip tx whose block row is not committed yet
  // (the row's blockTime).
  block: { timestamp: string | null; height: string };
  gasUsed: string | null;
  gasWanted: string | null;
  signerAddress: string | null;
  fees: unknown;
  amountOfMessages: unknown;
  amountSentByDenom: unknown;
}

/** A transaction row as the indexer lists it: its block's height and time (null while the block row is not committed). */
export type TxNode = Omit<BlockTx, 'block'> & { blockId: string; blockTime: string | null };

/** Transaction rows with `block` filled from their own height and time. */
export function withBlocks(nodes: TxNode[]): BlockTx[] {
  return nodes.map(({ blockId, blockTime, ...n }) => ({ ...n, block: { timestamp: blockTime, height: String(blockId) } }));
}

/** The supply rows in force at a block (the home page's fallback for the total supply). */
export async function getBlockSupplies(network: NetworkId, height: string): Promise<SupplyNode[]> {
  const data = await gqlFetch<{ supplies: { denom: string; amount: string }[] | null }>(network, BLOCK_SUPPLIES, { height }, { revalidate: 15 });
  return (data.supplies ?? []).map((supply) => ({ supply }));
}

/** Immutable once buried ≥ threshold below head; short TTL near the tip (§3). */
function revalidateForHeight(height: number | null, targetHeight: number | null): number | false {
  if (height != null && targetHeight != null && targetHeight - height >= INDEXER_LAG_THRESHOLD) return false;
  return 15;
}

// ---- lists ----
/** `withCount: false` skips the total (a count over every block) for callers that don't show it. */
export async function getBlockList(network: NetworkId, limit: number, offset: number, withCount = true) {
  const data = await gqlFetch<{ blocks: { nodes: BlockRow[]; totalCount?: number } }>(
    network,
    BLOCK_LIST,
    { limit, offset, withCount },
    { revalidate: 15 },
  );
  return data.blocks;
}

export async function getBlockSummary(network: NetworkId) {
  const end = new Date(roundedNow()); // a stable cache key for the minute
  const start = new Date(end.getTime() - 24 * 60 * 60 * 1000);
  const data = await gqlFetch<{ latest: { nodes: { height: string }[] }; stats: unknown }>(
    network,
    BLOCK_SUMMARY,
    { rangeStart: start.toISOString(), rangeEnd: end.toISOString() },
    { revalidate: 15 },
  );
  const stats = unwrapRange<{ total_txs: string | null; avg_time_to_block_ms: string | null; avg_size_bytes: string | null }[]>(data.stats).data?.[0];
  // The statistics function sends every number as a JSON string — coerce to number.
  const num = (v: number | string | null | undefined) => (v == null ? null : Number(v));
  return {
    latestHeight: data.latest.nodes[0]?.height ?? null,
    // 24h transaction total — the latest single block is usually 0 (settlement is bursty), so a
    // window sum is the meaningful headline metric (matches the other 24h cards on this page).
    txns24h: num(stats?.total_txs),
    avgTimeToBlock: num(stats?.avg_time_to_block_ms),
    avgSize: num(stats?.avg_size_bytes),
  };
}

// ---- detail ----
/** Resolve a block by height (numeric) or hash (64-hex). Falls back to RPC when `fallback.useRpc`. */
export async function resolveBlock(network: NetworkId, idParam: string, fallback: FallbackDecision): Promise<BlockDetail | null> {
  const target = fallback.metadata?.targetHeight ?? null;
  const isHeight = /^\d+$/.test(idParam);

  if (fallback.useRpc && isHeight) {
    return getBlockFromRpc(network, idParam);
  }

  // The metadata record and supply rows ride in the block's own read as extras: a failed read of them renders the block without.
  type Extras = { metadata: { header: unknown; lastCommit: unknown; blockId: unknown }[] | null; supplies: { denom: string; amount: string }[] | null };
  const extrasOf = (d: Extras) => ({ metadata: d.metadata?.[0] ?? null, supplies: { nodes: (d.supplies ?? []).map((supply) => ({ supply })) } });
  const partial = ['metadata', 'supplies'];

  if (isHeight) {
    const revalidate = revalidateForHeight(Number(idParam), target);
    const data = await gqlFetch<{ block: BlockDetail | null } & Extras>(
      network,
      BLOCK_BY_HEIGHT,
      { height: idParam, supplyHeight: idParam },
      { revalidate, partial },
    );
    return data.block ? { ...data.block, ...extrasOf(data), source: 'indexer' } : null;
  }

  if (HEX64.test(idParam)) {
    const data = await gqlFetch<{ blocks: { nodes: BlockDetail[] } } & Extras>(network, BLOCK_BY_HASH, { hash: idParam }, { revalidate: 15, partial });
    const node = data.blocks.nodes[0];
    return node ? { ...node, ...extrasOf(data), source: 'indexer' } : null;
  }

  return null;
}

export async function getBlockTransactions(
  network: NetworkId,
  height: string,
  limit: number,
  offset: number,
  targetHeight: number | null,
) {
  const revalidate = revalidateForHeight(Number(height), targetHeight);
  const data = await gqlFetch<{ transactions: { nodes: TxNode[]; totalCount: number } }>(
    network,
    TRANSACTIONS_BY_HEIGHT,
    { limit, offset, filter: { blockId: { equalTo: Number(height) } } },
    { revalidate },
  );
  return { totalCount: data.transactions.totalCount, nodes: withBlocks(data.transactions.nodes) };
}

// ---- RPC fallback (Tendermint) — partial; indexer-only metrics are unavailable here (§2) ----
interface TmBlockResponse {
  result: {
    block_id: { hash: string };
    block: { header: { height: string; time: string; proposer_address: string }; data: { txs: string[] } };
  };
}
async function getBlockFromRpc(network: NetworkId, height: string): Promise<BlockDetail | null> {
  try {
    const r = await rpcFetch<TmBlockResponse>(network, `/block?height=${height}`, { revalidate: 15 });
    const h = r.result.block.header;
    const txs = r.result.block.data.txs ?? [];
    return {
      height: h.height,
      hash: r.result.block_id.hash,
      timestamp: h.time,
      totalTxs: txs.length,
      successfulTxs: txs.length,
      timeToBlock: null,
      stakedApps: 0,
      stakedSuppliers: 0,
      stakedGateways: 0,
      totalRelays: null,
      totalComputedUnits: null,
      proposerAddress: h.proposer_address,
      size: null,
      metadata: null,
      source: 'rpc',
    };
  } catch {
    return null;
  }
}
