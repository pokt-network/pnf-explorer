import { gqlFetch } from '@/lib/graphql';
import { rpcFetch } from '@/lib/lcd';
import { INDEXER_LAG_THRESHOLD } from '@/lib/config';
import type { NetworkId } from '@/lib/networks';
import { BLOCK_BY_HASH, BLOCK_BY_HEIGHT, BLOCK_EXTRAS, BLOCK_LIST, BLOCK_SUMMARY, BLOCK_TIMES } from '@/lib/queries/blocks';
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
  // (see getBlockTimes).
  block: { timestamp: string | null; height: string };
  gasUsed: string | null;
  gasWanted: string | null;
  signerAddress: string | null;
  fees: unknown;
  amountOfMessages: unknown;
  amountSentByDenom: unknown;
}

/** A transaction row as the indexer lists it: its block's height, without the block (see withBlocks). */
export type TxNode = Omit<BlockTx, 'block'> & { blockId: string };

/**
 * The timestamp of each height asked for, keyed by height. A height whose block row is not visible yet is
 * absent: the indexer commits a block's transactions, transfers and balances before its blocks row (~30-40 s
 * on settlement blocks), so a fresh row can carry a height with no block yet. Callers render that as pending.
 * Lists carry the height alone; this is the second read that puts the time next to it.
 */
export async function getBlockTimes(network: NetworkId, heights: (string | number)[], revalidate: number | false = 15): Promise<Map<string, string>> {
  const ids = [...new Set(heights.map(String))];
  if (ids.length === 0) return new Map();
  // A block row still being written answers without its time, and that answer is cached as long as asked: callers ask
  // 15 s, and `false` (for good) only for heights at or below the indexer's last processed height, written whole.
  // A failed read drops the times (the rows show "pending"), not the page, and is logged as a failure.
  try {
    const data = await gqlFetch<{ blocks: { nodes: { height: string; timestamp: string }[] } }>(
      network,
      BLOCK_TIMES,
      { heights: ids, limit: ids.length },
      { revalidate },
    );
    return new Map(data.blocks.nodes.map((b) => [String(b.height), b.timestamp]));
  } catch (e) {
    console.error(`Block times read failed for ${ids.length} height(s): ${(e as Error).message}`);
    return new Map();
  }
}

/** Transaction rows with `block` filled from their heights; its timestamp is null while the block row is not committed. */
export async function withBlocks(network: NetworkId, nodes: TxNode[]): Promise<BlockTx[]> {
  const times = await getBlockTimes(network, nodes.map((n) => n.blockId));
  return nodes.map(({ blockId, ...n }) => ({ ...n, block: { timestamp: times.get(String(blockId)) ?? null, height: String(blockId) } }));
}

/** The supply rows in force at a block, and its metadata record. */
async function getBlockExtras(network: NetworkId, height: string, revalidate: number | false) {
  const data = await gqlFetch<{
    metadata: { header: unknown; lastCommit: unknown; blockId: unknown } | null;
    supplies: { denom: string; amount: string }[] | null;
  }>(network, BLOCK_EXTRAS, { height, supplyHeight: height }, { revalidate });
  return { metadata: data.metadata, supplies: { nodes: (data.supplies ?? []).map((supply) => ({ supply })) } };
}

/** The supply rows in force at a block (the home page's fallback for the total supply). */
export async function getBlockSupplies(network: NetworkId, height: string): Promise<SupplyNode[]> {
  return (await getBlockExtras(network, height, 15)).supplies.nodes;
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
  const end = new Date(roundedNow()); // a stable fetch-cache key for the minute
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

  // The metadata record and supply rows are extras: a failed read renders the block without them, and a
  // height past the indexed tip has none to read.
  const tip = fallback.metadata?.lastProcessedHeight ?? null;
  const extrasOf = (height: string, revalidate: number | false) =>
    tip != null && Number(height) > tip ? Promise.resolve(null) : getBlockExtras(network, height, revalidate).catch(() => null);

  if (isHeight) {
    const revalidate = revalidateForHeight(Number(idParam), target);
    const [data, extras] = await Promise.all([
      gqlFetch<{ block: BlockDetail | null }>(network, BLOCK_BY_HEIGHT, { height: idParam }, { revalidate }),
      extrasOf(idParam, revalidate),
    ]);
    return data.block ? { ...data.block, ...extras, source: 'indexer' } : null;
  }

  if (HEX64.test(idParam)) {
    const data = await gqlFetch<{ blocks: { nodes: BlockDetail[] } }>(network, BLOCK_BY_HASH, { hash: idParam }, { revalidate: 15 });
    const node = data.blocks.nodes[0];
    return node ? { ...node, ...(await extrasOf(node.height, 15)), source: 'indexer' } : null;
  }

  return null;
}

/** `timestamp`: the block's time when the caller already has it (the block page), saving the block-time read. */
export async function getBlockTransactions(
  network: NetworkId,
  height: string,
  limit: number,
  offset: number,
  targetHeight: number | null,
  timestamp?: string,
) {
  const revalidate = revalidateForHeight(Number(height), targetHeight);
  const data = await gqlFetch<{ transactions: { nodes: TxNode[]; totalCount: number } }>(
    network,
    TRANSACTIONS_BY_HEIGHT,
    { limit, offset, filter: { blockId: { equalTo: Number(height) } } },
    { revalidate },
  );
  const nodes = timestamp
    ? data.transactions.nodes.map(({ blockId, ...n }): BlockTx => ({ ...n, block: { timestamp, height: String(blockId) } }))
    : await withBlocks(network, data.transactions.nodes);
  return { totalCount: data.transactions.totalCount, nodes };
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
