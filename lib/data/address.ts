import { gqlFetch } from '@/lib/graphql';
import type { NetworkId } from '@/lib/networks';
import { TRANSACTIONS_BY_ADDRESS, TRANSFERS_LIST } from '@/lib/queries/transactions';
import { getBlockTimes, withBlocks, type BlockTx, type TxNode } from '@/lib/data/blocks';

// Shared by account + validator detail pages (Transactions / Transfers tabs).
// Per-address data is short-TTL (§3) — low hit rate, don't over-engineer.

export interface Transfer {
  id: string;
  senderId: string;
  recipientId: string;
  amounts: unknown; // [{denom, amount}] upokt
  denom: string;
  /** The timestamp is null while the block row is not committed (getBlockTimes). */
  block: { height: string; timestamp: string | null } | null;
  transactionId: string;
}

/** Transactions signed by an address. (Validator pages pass the validator's signer address.) `withTimes: false` skips
 *  the block-time read, for callers that need only the total. */
export async function getAddressTransactions(network: NetworkId, address: string, limit: number, offset: number, withTimes = true) {
  const data = await gqlFetch<{ transactions: { nodes: TxNode[]; totalCount: number } }>(
    network,
    TRANSACTIONS_BY_ADDRESS,
    { limit, offset, filter: { signerAddress: { equalTo: address } } },
    { revalidate: 30 },
  );
  if (!withTimes) return { totalCount: data.transactions.totalCount, nodes: [] as BlockTx[] };
  return { totalCount: data.transactions.totalCount, nodes: await withBlocks(network, data.transactions.nodes) };
}

/** Native MsgSend transfers where the address is sender or recipient. `withTimes: false`: the total only, no block-time read. */
export async function getTransfers(network: NetworkId, address: string, limit: number, offset: number, withTimes = true) {
  const data = await gqlFetch<{ transfers: { nodes: (Omit<Transfer, 'block'> & { blockId: string })[]; totalCount: number } }>(
    network,
    TRANSFERS_LIST,
    { limit, offset, address },
    { revalidate: 30 },
  );
  if (!withTimes) return { totalCount: data.transfers.totalCount, nodes: [] as Transfer[] };
  const times = await getBlockTimes(network, data.transfers.nodes.map((n) => n.blockId));
  return {
    totalCount: data.transfers.totalCount,
    nodes: data.transfers.nodes.map(({ blockId, ...t }) => ({ ...t, block: { height: String(blockId), timestamp: times.get(String(blockId)) ?? null } })),
  };
}
