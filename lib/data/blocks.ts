import { gqlFetch } from '@/lib/graphql';
import { rpcFetch } from '@/lib/lcd';
import { INDEXER_LAG_THRESHOLD } from '@/lib/config';
import type { NetworkId } from '@/lib/networks';
import { BLOCK_BY_HASH, BLOCK_BY_HEIGHT, BLOCK_EXTRAS, BLOCK_LIST, BLOCK_SUMMARY, BLOCK_TIMES, SUPPLIES_BY_ID } from '@/lib/queries/blocks';
import { TRANSACTIONS_BY_HEIGHT } from '@/lib/queries/transactions';
import type { FallbackDecision } from '@/lib/types';
import { unwrapRange } from '@/lib/data/range';

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
  // Null transiently for a tip tx indexed before its block lands.
  block: { timestamp: string; height: string } | null;
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
 * The timestamp of each height asked for, keyed by height. A height whose block is not indexed yet is
 * absent. Lists carry the height alone; this is the second read that puts the time next to it.
 */
export async function getBlockTimes(network: NetworkId, heights: (string | number)[], revalidate: number | false = 15): Promise<Map<string, string>> {
  const ids = [...new Set(heights.map(String))];
  if (ids.length === 0) return new Map();
  const data = await gqlFetch<{ blocks: { nodes: { height: string; timestamp: string }[] } }>(
    network,
    BLOCK_TIMES,
    { heights: ids, limit: ids.length },
    { revalidate },
  );
  return new Map(data.blocks.nodes.map((b) => [String(b.height), b.timestamp]));
}

/** Transaction rows with `block` filled from their heights (null while the block is not indexed). */
export async function withBlocks(network: NetworkId, nodes: TxNode[], revalidate: number | false = 15): Promise<BlockTx[]> {
  const times = await getBlockTimes(network, nodes.map((n) => n.blockId), revalidate);
  return nodes.map(({ blockId, ...n }) => {
    const timestamp = times.get(String(blockId));
    return { ...n, block: timestamp ? { timestamp, height: String(blockId) } : null };
  });
}

/** The supply rows in force at a block, and its metadata record. */
async function getBlockExtras(network: NetworkId, height: string, revalidate: number | false) {
  const data = await gqlFetch<{
    metadata: { header: unknown; lastCommit: unknown; blockId: unknown } | null;
    blockSupplies: { nodes: { supplyId: string }[] };
  }>(network, BLOCK_EXTRAS, { height }, { revalidate });
  const ids = data.blockSupplies.nodes.map((n) => n.supplyId);
  const supplies =
    ids.length === 0
      ? []
      : (await gqlFetch<{ supplies: { nodes: { denom: string; amount: string }[] } }>(network, SUPPLIES_BY_ID, { ids }, { revalidate })).supplies.nodes;
  return { metadata: data.metadata, supplies: { nodes: supplies.map((supply) => ({ supply })) } };
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
  const end = new Date();
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

  if (isHeight) {
    const revalidate = revalidateForHeight(Number(idParam), target);
    const [data, extras] = await Promise.all([
      gqlFetch<{ block: BlockDetail | null }>(network, BLOCK_BY_HEIGHT, { height: idParam }, { revalidate }),
      getBlockExtras(network, idParam, revalidate),
    ]);
    return data.block ? { ...data.block, ...extras, source: 'indexer' } : null;
  }

  if (HEX64.test(idParam)) {
    const data = await gqlFetch<{ blocks: { nodes: BlockDetail[] } }>(network, BLOCK_BY_HASH, { hash: idParam }, { revalidate: 15 });
    const node = data.blocks.nodes[0];
    return node ? { ...node, ...(await getBlockExtras(network, node.height, 15)), source: 'indexer' } : null;
  }

  return null;
}

export async function getBlockTransactions(network: NetworkId, height: string, limit: number, offset: number, targetHeight: number | null) {
  const revalidate = revalidateForHeight(Number(height), targetHeight);
  const data = await gqlFetch<{ transactions: { nodes: TxNode[]; totalCount: number } }>(
    network,
    TRANSACTIONS_BY_HEIGHT,
    { limit, offset, filter: { blockId: { equalTo: Number(height) } } },
    { revalidate },
  );
  return { totalCount: data.transactions.totalCount, nodes: await withBlocks(network, data.transactions.nodes, revalidate) };
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
