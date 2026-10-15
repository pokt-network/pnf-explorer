import { gqlFetch } from '@/lib/graphql';
import { lcdFetch } from '@/lib/lcd';
import { INDEXER_LAG_THRESHOLD } from '@/lib/config';
import type { NetworkId } from '@/lib/networks';
import { DataError } from '@/lib/errors';
import { TRANSACTIONS_LIST, TRANSACTIONS_SUMMARY, TRANSACTION_DETAIL } from '@/lib/queries/transactions';
import { getBlockTimes, withBlocks, type TxNode } from '@/lib/data/blocks';
import { unwrapRange } from '@/lib/data/range';
import { roundedNow } from '@/lib/data/window';

const HEX64 = /^[0-9a-fA-F]{64}$/;

/** Tx-type / status filter chips (DATA-CONTRACT §4). Maps a URL `?type=` value → TransactionFilter. */
export type TxFilterKey = 'all' | 'success' | 'failed' | 'msgsend' | 'msgclaim' | 'msgproof';

// The indexer rejects both null and empty `{}` filters, so "all" uses a no-op that
// matches every row (every tx has an id). Every chip keeps it: it is the predicate of the indexer's
// (block_id DESC) partial index on live rows, without which a chip sorts all ~43M transactions
// (Success 6.9 s → 0.6 s on mainnet, 2026-10-08).
const LIVE = { id: { isNull: false } };
// A message chip matches the transactions whose own per-type message count lists that type (JSON
// containment): the closed schema has no filter through the message tables.
const hasMessage = (type: string) => ({ amountOfMessages: { contains: [{ type }] } });
const FILTERS: Record<TxFilterKey, Record<string, unknown>> = {
  all: LIVE,
  success: { ...LIVE, code: { equalTo: 0 } },
  failed: { ...LIVE, code: { notEqualTo: 0 } },
  msgsend: { ...LIVE, ...hasMessage('/cosmos.bank.v1beta1.MsgSend') },
  msgclaim: { ...LIVE, ...hasMessage('/pocket.proof.MsgCreateClaim') },
  msgproof: { ...LIVE, ...hasMessage('/pocket.proof.MsgSubmitProof') },
};

export function txFilterKey(raw: string | undefined): TxFilterKey {
  const v = (raw ?? 'all').toLowerCase();
  return (['all', 'success', 'failed', 'msgsend', 'msgclaim', 'msgproof'] as TxFilterKey[]).includes(v as TxFilterKey)
    ? (v as TxFilterKey)
    : 'all';
}

/** Detail header shape from the indexer `transaction(id)` query. */
export interface TxDetail {
  id: string;
  code: number;
  codespace: string | null;
  /** The timestamp is null while the block row is not committed (getBlockTimes). */
  block: { timestamp: string | null; height: string };
  gasUsed: string | null;
  gasWanted: string | null;
  signerAddress: string | null;
  fees: unknown;
  memo: string | null;
  isMultisig: boolean | null;
  multisig: unknown;
  amountSentByDenom: unknown;
}

// ---- list ----
/** `withCount: false` skips the total (a count over every matching transaction) for callers that don't show it. */
export async function getTransactionsList(network: NetworkId, limit: number, offset: number, filter: TxFilterKey, withCount = true) {
  const data = await gqlFetch<{ transactions: { nodes: TxNode[]; totalCount?: number } }>(
    network,
    TRANSACTIONS_LIST,
    { limit, offset, filter: FILTERS[filter], withCount },
    { revalidate: 15 },
  );
  return { totalCount: data.transactions.totalCount, nodes: await withBlocks(network, data.transactions.nodes) };
}

interface TxSums {
  total_txs: string | null;
  successful_txs: string | null;
  failed_txs: string | null;
}

/** The all-time total behind a chip, where the per-block counters have it (all/success/failed). */
const CHAIN_TOTAL: Partial<Record<TxFilterKey, keyof TxSums>> = { all: 'total_txs', success: 'successful_txs', failed: 'failed_txs' };

/** True when `getTransactionsSummary` returns this chip's total; the other chips show none (counting them is too costly). */
export function hasChainTotal(filter: TxFilterKey): boolean {
  return CHAIN_TOTAL[filter] != null;
}

/**
 * Latest-block and 24h counts, plus the chip's all-time total when the per-block counters carry it
 * (`chainTotal`, null otherwise — the list then shows no total and pages by its next row).
 */
export async function getTransactionsSummary(network: NetworkId, filter: TxFilterKey) {
  const end = new Date(roundedNow()); // a stable fetch-cache key for the minute
  const start = new Date(end.getTime() - 24 * 60 * 60 * 1000);
  const chainKey = CHAIN_TOTAL[filter];
  const data = await gqlFetch<{
    blocks: { nodes: { totalTxs: number }[] };
    day: unknown;
    chain?: unknown;
  }>(
    network,
    TRANSACTIONS_SUMMARY,
    { startDate: start.toISOString(), endDate: end.toISOString(), withChain: chainKey != null },
    { revalidate: 15 },
  );
  // The statistics function sends every number as a JSON string — coerce to number.
  const day = unwrapRange<TxSums[]>(data.day).data?.[0];
  const chain = chainKey ? unwrapRange<TxSums[]>(data.chain).data?.[0]?.[chainKey] : null;
  return {
    latestBlockTxs: data.blocks.nodes[0]?.totalTxs ?? null,
    successful24h: Number(day?.successful_txs ?? 0),
    failed24h: Number(day?.failed_txs ?? 0),
    chainTotal: chain != null ? Number(chain) : null,
  };
}

// ---- detail (indexer header) ----
/** Immutable once the tx's block is buried ≥ threshold below head; short TTL near the tip (§3). */
function revalidateForHeight(height: number | null, targetHeight: number | null): number | false {
  if (height != null && targetHeight != null && targetHeight - height >= INDEXER_LAG_THRESHOLD) return false;
  return 15;
}

/**
 * Indexer tx header. The indexer stores hashes UPPERCASE and is case-sensitive, so we
 * normalize before querying (a lowercased hash otherwise returns null → false 404).
 * `processedHeight` is the indexer's lastProcessedHeight: blocks at or below it are written whole.
 */
export async function getTransaction(
  network: NetworkId,
  id: string,
  targetHeight: number | null,
  processedHeight: number | null,
): Promise<TxDetail | null> {
  const hash = HEX64.test(id) ? id.toUpperCase() : id;
  type TxRow = Omit<TxDetail, 'block'> & { blockId: string };
  // First fetch with a short TTL; if it lands far below head we could cache harder, but a
  // single round-trip keeps it simple — bury-immutability is applied on the next render.
  const data = await gqlFetch<{ transaction: TxRow | null }>(network, TRANSACTION_DETAIL, { id: hash }, { revalidate: 15 });
  let row = data.transaction;
  if (!row) return null;
  // Re-key cache by burial once we know the height (cheap; same query, immutable revalidate).
  const rev = revalidateForHeight(Number(row.blockId), targetHeight);
  if (rev === false) {
    const fixed = await gqlFetch<{ transaction: TxRow | null }>(network, TRANSACTION_DETAIL, { id: hash }, { revalidate: false });
    row = fixed.transaction ?? row;
  }
  // The block's time is a second read. Cached for good like the row only when the block is buried AND at or below the
  // indexer's last processed height, so its row is written whole and has its time; otherwise 15 s, since a tip tx may
  // be indexed before its block row is committed (timestamp null meanwhile) and that answer must not stick.
  const { blockId, ...tx } = row;
  const whole = processedHeight != null && Number(blockId) <= processedHeight;
  const timestamp = (await getBlockTimes(network, [blockId], rev === false && whole ? false : 15)).get(String(blockId)) ?? null;
  return { ...tx, block: { timestamp, height: String(blockId) } };
}

// ---- ALWAYS-LCD: Messages / Events / Raw (§2, §8.6.1) ----
export interface LcdTxMessage {
  '@type': string;
  [k: string]: unknown;
}
export interface LcdEventAttribute {
  key: string;
  value: string;
}
export interface LcdEvent {
  type: string;
  attributes: LcdEventAttribute[];
}
export interface LcdTxResponse {
  tx: {
    body: { messages: LcdTxMessage[]; memo?: string };
    auth_info?: unknown;
    signatures?: unknown;
  };
  tx_response: {
    txhash: string;
    height: string;
    code: number;
    codespace?: string;
    gas_used: string;
    gas_wanted: string;
    raw_log?: string;
    events: LcdEvent[];
  };
}

/** Discriminated outcome so the detail page can render the right §11 state without throwing. */
export type LcdTxResult =
  | { state: 'ok'; data: LcdTxResponse }
  | { state: 'indexing' } // LCD 5xx (tip not yet indexed, or node tx-indexing disabled — §7)
  | { state: 'not-found' };

/**
 * ALWAYS-LCD fetch of the full committed tx for Messages/Events/Raw. The Sauron LCD may 500
 * on tip txs (not yet indexed) or when node tx-indexing is unavailable → surface as a transient
 * 'indexing' state, NOT a hard error. A 404 is a genuine miss.
 */
export async function getTxFromLcd(network: NetworkId, hash: string): Promise<LcdTxResult> {
  try {
    const data = await lcdFetch<LcdTxResponse>(network, `/cosmos/tx/v1beta1/txs/${hash}`, { revalidate: 15 });
    return { state: 'ok', data };
  } catch (e) {
    if (e instanceof DataError) {
      if (e.kind === 'not-found') return { state: 'not-found' };
      if (e.kind === 'server') return { state: 'indexing' };
    }
    // network or anything else → treat as transient indexing so the page still renders
    return { state: 'indexing' };
  }
}
