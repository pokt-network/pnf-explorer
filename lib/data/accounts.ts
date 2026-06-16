import { gqlFetch } from '@/lib/graphql';
import type { NetworkId } from '@/lib/networks';
import { ACCOUNT_LIST, ACCOUNT_SUMMARY, ACCOUNT_BY_ID } from '@/lib/queries/accounts';
import { SEARCH_BY_ADDRESS } from '@/lib/queries/search';
import { BLOCK_LIST } from '@/lib/queries/blocks';
import { sumUpokt } from '@/lib/tx';
import type { SupplyNode } from '@/lib/data/blocks';

// ---- shapes ----
export interface AccountListRow {
  amount: string;
  denom: string;
  accountId: string;
  lastUpdatedBlock: { height: string; timestamp: string } | null;
}

export interface AccountBalance {
  amount: string;
  denom: string;
  lastUpdatedBlock: { height: string; timestamp: string } | null;
}

export interface Account {
  id: string;
  balances: { nodes: AccountBalance[] };
}

export interface StakeRole {
  id: string;
  stakeStatus: string | null;
  stakeAmount: string | null;
  stakeDenom: string | null;
}

export interface AddressRoles {
  account: Account | null;
  supplier: StakeRole | null;
  application: StakeRole | null;
  gateway: StakeRole | null;
}

export interface AccountSummary {
  accountsWithBalance: number | null;
  todayAccounts: number | null;
  monthAccounts: number | null;
  last90DaysAccounts: number | null;
}

// ---- list ----
export async function getAccountList(network: NetworkId, limit: number, offset: number) {
  const data = await gqlFetch<{ balances: { nodes: AccountListRow[]; totalCount: number } }>(
    network,
    ACCOUNT_LIST,
    { limit, offset },
    { revalidate: 15 },
  );
  return data.balances;
}

export async function getAccountSummary(network: NetworkId): Promise<AccountSummary> {
  const now = new Date();
  // Start of today (UTC), -30d, -90d — ISO Datetime strings for the indexer filters.
  const todayDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
  const monthDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const last90Date = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString();
  const data = await gqlFetch<{
    accountsWithBalance: { totalCount: number };
    todayAccounts: { totalCount: number };
    monthAccounts: { totalCount: number };
    last90DaysAccounts: { totalCount: number };
  }>(network, ACCOUNT_SUMMARY, { todayDate, monthDate, last90Date }, { revalidate: 15 });
  return {
    accountsWithBalance: data.accountsWithBalance?.totalCount ?? null,
    todayAccounts: data.todayAccounts?.totalCount ?? null,
    monthAccounts: data.monthAccounts?.totalCount ?? null,
    last90DaysAccounts: data.last90DaysAccounts?.totalCount ?? null,
  };
}

/** Total upokt supply (latest block) — used to compute per-account share %. Best-effort. */
export async function getTotalSupplyUpokt(network: NetworkId): Promise<bigint | null> {
  try {
    const data = await gqlFetch<{ blocks: { nodes: { supplies?: { nodes: SupplyNode[] } }[] } }>(
      network,
      BLOCK_LIST,
      { limit: 1, offset: 0 },
      { revalidate: 15 },
    );
    const supplies = data.blocks.nodes[0]?.supplies?.nodes;
    if (!supplies?.length) return null;
    const total = sumUpokt(supplies.map((n) => n.supply));
    return total > BigInt(0) ? total : null;
  } catch {
    return null;
  }
}

// ---- detail ----
export async function getAccount(network: NetworkId, id: string): Promise<Account | null> {
  const data = await gqlFetch<{ account: Account | null }>(network, ACCOUNT_BY_ID, { id }, { revalidate: 30 });
  return data.account;
}

/** Resolve all on-chain roles for an address (account balance + supplier/app/gateway stake info). */
export async function getAddressRoles(network: NetworkId, id: string): Promise<AddressRoles> {
  const data = await gqlFetch<AddressRoles>(network, SEARCH_BY_ADDRESS, { address: id }, { revalidate: 30 });
  return {
    account: data.account ?? null,
    supplier: data.supplier ?? null,
    application: data.application ?? null,
    gateway: data.gateway ?? null,
  };
}
