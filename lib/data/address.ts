import { gqlFetch } from '@/lib/graphql';
import { TRANSACTIONS_BY_ADDRESS, TRANSFERS_LIST } from '@/lib/queries/transactions';
import type { BlockTx } from '@/lib/data/blocks';

// Shared by account + validator detail pages (Transactions / Transfers tabs).
// Per-address data is short-TTL (§3) — low hit rate, don't over-engineer.

export interface Transfer {
  id: string;
  senderId: string;
  recipientId: string;
  amounts: unknown; // [{denom, amount}] upokt
  denom: string;
  block: { height: string; timestamp: string } | null;
  transaction: { id: string; fees: unknown; gasUsed: string | null; gasWanted: string | null; code: number; codespace: string | null };
}

/** Transactions signed by an address. (Validator pages pass the validator's signer address.) */
export async function getAddressTransactions(address: string, limit: number, offset: number) {
  const data = await gqlFetch<{ transactions: { nodes: BlockTx[]; totalCount: number } }>(
    TRANSACTIONS_BY_ADDRESS,
    { limit, offset, filter: { signerAddress: { equalTo: address } } },
    { revalidate: 30 },
  );
  return data.transactions;
}

/** Native MsgSend transfers where the address is sender or recipient. */
export async function getTransfers(address: string, limit: number, offset: number) {
  const data = await gqlFetch<{ transfers: { nodes: Transfer[]; totalCount: number } }>(
    TRANSFERS_LIST,
    { limit, offset, address },
    { revalidate: 30 },
  );
  return data.transfers;
}
