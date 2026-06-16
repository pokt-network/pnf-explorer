import { gqlFetch } from '@/lib/graphql';
import { rpcFetch } from '@/lib/lcd';
import { INDEXER_LAG_THRESHOLD } from '@/lib/config';
import type { NetworkId } from '@/lib/networks';
import { BLOCK_BY_HASH, BLOCK_BY_HEIGHT, BLOCK_LIST, BLOCK_SUMMARY } from '@/lib/queries/blocks';
import { TRANSACTIONS_BY_HEIGHT } from '@/lib/queries/transactions';
import type { FallbackDecision } from '@/lib/types';

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
  // Null transiently for a tip tx indexed before its block relation lands.
  block: { timestamp: string; height: string } | null;
  gasUsed: string | null;
  gasWanted: string | null;
  signerAddress: string | null;
  fees: unknown;
  amountOfMessages: unknown;
  amountSentByDenom: unknown;
}

/** Immutable once buried ≥ threshold below head; short TTL near the tip (§3). */
function revalidateForHeight(height: number | null, targetHeight: number | null): number | false {
  if (height != null && targetHeight != null && targetHeight - height >= INDEXER_LAG_THRESHOLD) return false;
  return 15;
}

// ---- lists ----
export async function getBlockList(network: NetworkId, limit: number, offset: number) {
  const data = await gqlFetch<{ blocks: { nodes: BlockRow[]; totalCount: number } }>(network, BLOCK_LIST, { limit, offset }, { revalidate: 15 });
  return data.blocks;
}

export async function getBlockSummary(network: NetworkId) {
  const end = new Date();
  const start = new Date(end.getTime() - 24 * 60 * 60 * 1000);
  const data = await gqlFetch<{
    avgs: {
      nodes: { height: string; totalTxs: number }[];
      aggregates: { average: { timeToBlock: string | null; size: string | null }; sum: { totalTxs: string | null } };
    };
  }>(network, BLOCK_SUMMARY, { startDate: start.toISOString(), endDate: end.toISOString() }, { revalidate: 15 });
  const node = data.avgs.nodes[0];
  const avg = data.avgs.aggregates?.average;
  // GraphQL aggregate averages/sums serialize as strings — coerce to number.
  const num = (v: number | string | null | undefined) => (v == null ? null : Number(v));
  return {
    latestHeight: node?.height ?? null,
    // 24h transaction total — the latest single block is usually 0 (settlement is bursty), so a
    // window sum is the meaningful headline metric (matches the other 24h cards on this page).
    txns24h: num(data.avgs.aggregates?.sum?.totalTxs),
    avgTimeToBlock: num(avg?.timeToBlock),
    avgSize: num(avg?.size),
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
    const data = await gqlFetch<{ block: BlockDetail | null }>(network, BLOCK_BY_HEIGHT, { height: idParam }, { revalidate });
    return data.block ? { ...data.block, source: 'indexer' } : null;
  }

  if (HEX64.test(idParam)) {
    const data = await gqlFetch<{ blocks: { nodes: BlockDetail[] } }>(network, BLOCK_BY_HASH, { hash: idParam }, { revalidate: 15 });
    const node = data.blocks.nodes[0];
    return node ? { ...node, source: 'indexer' } : null;
  }

  return null;
}

export async function getBlockTransactions(network: NetworkId, height: string, limit: number, offset: number, targetHeight: number | null) {
  const revalidate = revalidateForHeight(Number(height), targetHeight);
  const data = await gqlFetch<{ transactions: { nodes: BlockTx[]; totalCount: number } }>(
    network,
    TRANSACTIONS_BY_HEIGHT,
    { limit, offset, filter: { blockId: { equalTo: Number(height) } } },
    { revalidate },
  );
  return data.transactions;
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
