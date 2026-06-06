import { gqlFetch } from '@/lib/graphql';
import { lcdFetch } from '@/lib/lcd';
import { INDEXER_LAG_THRESHOLD } from '@/lib/config';
import { DataError } from '@/lib/errors';
import { TRANSACTIONS_LIST, TRANSACTIONS_SUMMARY, TRANSACTION_DETAIL } from '@/lib/queries/transactions';
import type { BlockTx } from '@/lib/data/blocks';

const HEX64 = /^[0-9a-fA-F]{64}$/;

/** Tx-type / status filter chips (DATA-CONTRACT §4). Maps a URL `?type=` value → TransactionFilter. */
export type TxFilterKey = 'all' | 'success' | 'failed' | 'msgsend' | 'msgclaim' | 'msgproof';

// The indexer rejects both null and empty `{}` filters, so "all" uses a no-op that
// matches every row (every tx has an id).
const FILTERS: Record<TxFilterKey, Record<string, unknown>> = {
  all: { id: { isNull: false } },
  success: { code: { equalTo: 0 } },
  failed: { code: { notEqualTo: 0 } },
  msgsend: { nativeTransfersExist: true },
  msgclaim: { msgCreateClaimsExist: true },
  msgproof: { msgSubmitProofsExist: true },
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
  block: { timestamp: string; height: string } | null;
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
export async function getTransactionsList(limit: number, offset: number, filter: TxFilterKey) {
  const data = await gqlFetch<{ transactions: { nodes: BlockTx[]; totalCount: number } }>(
    TRANSACTIONS_LIST,
    { limit, offset, filter: FILTERS[filter] },
    { revalidate: 15 },
  );
  return data.transactions;
}

export async function getTransactionsSummary() {
  const end = new Date();
  const start = new Date(end.getTime() - 24 * 60 * 60 * 1000);
  const data = await gqlFetch<{
    blocks: { nodes: { totalTxs: number }[] };
    validTxs: { totalCount: number };
    failedTxs: { totalCount: number };
  }>(TRANSACTIONS_SUMMARY, { startDate: start.toISOString(), endDate: end.toISOString() }, { revalidate: 15 });
  return {
    latestBlockTxs: data.blocks.nodes[0]?.totalTxs ?? null,
    successful24h: data.validTxs.totalCount,
    failed24h: data.failedTxs.totalCount,
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
 */
export async function getTransaction(id: string, targetHeight: number | null): Promise<TxDetail | null> {
  const hash = HEX64.test(id) ? id.toUpperCase() : id;
  // First fetch with a short TTL; if it lands far below head we could cache harder, but a
  // single round-trip keeps it simple — bury-immutability is applied on the next render.
  const data = await gqlFetch<{ transaction: TxDetail | null }>(TRANSACTION_DETAIL, { id: hash }, { revalidate: 15 });
  const tx = data.transaction;
  if (!tx) return null;
  // A tip tx may be indexed before its block relation lands (block null) → keep the short TTL.
  if (!tx.block) return tx;
  // Re-key cache by burial once we know the height (cheap; same query, immutable revalidate).
  const rev = revalidateForHeight(Number(tx.block.height), targetHeight);
  if (rev === false) {
    const fixed = await gqlFetch<{ transaction: TxDetail | null }>(TRANSACTION_DETAIL, { id: hash }, { revalidate: false });
    return fixed.transaction ?? tx;
  }
  return tx;
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
export async function getTxFromLcd(hash: string): Promise<LcdTxResult> {
  try {
    const data = await lcdFetch<LcdTxResponse>(`/cosmos/tx/v1beta1/txs/${hash}`, { revalidate: 15 });
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
