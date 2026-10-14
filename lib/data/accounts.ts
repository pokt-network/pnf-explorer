import { gqlFetch } from '@/lib/graphql';
import { getDelegations } from '@/lib/data/delegations';
import { getBlockTimes } from '@/lib/data/blocks';
import { getSupplierServiceCounts } from '@/lib/data/suppliers';
import type { NetworkId } from '@/lib/networks';
import {
  ACCOUNT_LIST,
  ACCOUNT_SUMMARY,
  ACCOUNT_SUMMARY_HEIGHTS,
  ACCOUNT_ROLES,
  OWNED_OPERATORS,
  APP_DELEGATED_GATEWAYS,
  GATEWAY_DELEGATING_APPS,
  REVSHARE_RECIPIENT_CONFIGS,
} from '@/lib/queries/accounts';

// Economic total supply (minted + claimable-but-unminted), used as the per-account share
// denominator so it matches the home Total Supply card. See lib/data/home.ts for the rationale.
const TOTAL_SUPPLY = /* GraphQL */ `
  query totalSupply($startDate: Datetime!, $endDate: Datetime!) {
    supply: getTotalSupplyByDay(startDate: $startDate, endDate: $endDate)
  }
`;

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

// ---- full role profile (account detail page) ----
export interface RevShareEntry {
  address: string;
  revSharePercentage: string;
}
export interface SupplierEndpoint {
  url: string;
  rpcType: number;
  configs: unknown[];
}
export interface SupplierServiceConfig {
  serviceId: string;
  revShare: RevShareEntry[];
  endpoints: SupplierEndpoint[];
}
/** Supplier OPERATOR view. `ownerId` may differ from the address (owner≠operator is common). */
export interface SupplierRole {
  id: string;
  operatorId: string;
  ownerId: string;
  stakeAmount: string | null;
  stakeStatus: string | null;
  unstakingReason: string | null;
  unstakingBeginBlockId: string | null;
  unstakingEndHeight: string | null;
  serviceConfigs: { totalCount: number; nodes: SupplierServiceConfig[] };
}
/** Supplier OWNER view: this address is the `ownerId` of ≥1 supplier (reverse lookup). */
export interface OwnerRole {
  operatorCount: number;
  totalStakeUpokt: string;
}
export interface ValidatorRoleLite {
  id: string; // valoper
  signerId: string;
  description: unknown;
  commission: unknown;
  minSelfDelegation: number | string | null;
  stakeAmount: string | null;
  stakeStatus: string | null;
}
export interface AppRole {
  id: string;
  stakeAmount: string | null;
  stakeStatus: string | null;
  unstakingReason: string | null;
  unstakingEndHeight: string | null;
  serviceCount: number;
  delegatedGatewayCount: number;
}
export interface GatewayRole {
  id: string;
  stakeAmount: string | null;
  stakeStatus: string | null;
  unstakingEndHeight: string | null;
  delegatingAppCount: number;
}
export interface OwnedService {
  id: string;
  name: string | null;
  computeUnitsPerRelay: string | number | null;
}
export interface AccountProfile {
  account: Account | null;
  supplier: SupplierRole | null;
  owner: OwnerRole | null;
  validator: ValidatorRoleLite | null;
  application: AppRole | null;
  gateway: GatewayRole | null;
  /** First few owned services (preview only — see `ownedServiceCount` for the real total). */
  ownedServices: OwnedService[];
  /** Total services owned. `ownedServices` is capped, so never count that array. */
  ownedServiceCount: number;
  /** # of supplier service-configs whose revShare[] pays this address (0 = not a recipient). */
  revShareRecipientConfigs: number;
  /**
   * # of validators this address has staked POKT with (0 = not a delegator). Always-LCD — the
   * indexer has no Delegation entity — so this is the one field on the profile that does not come
   * from the roles query. See lib/data/delegations.ts.
   */
  delegationCount: number;
  /** Total bonded across those delegations, upokt. */
  delegatedUpokt: string;
}

export interface OwnedOperatorRow {
  id: string;
  stakeStatus: string | null;
  stakeAmount: string | null;
  serviceConfigs: { totalCount: number };
}

/** One supplier→service config that pays the subject address a rev-share cut. */
export interface RevShareConfigRow {
  supplierId: string;
  serviceId: string;
  revShare: RevShareEntry[];
}

export interface AccountSummary {
  accountsWithBalance: number | null;
  todayAccounts: number | null;
  monthAccounts: number | null;
  last90DaysAccounts: number | null;
}

/** Balance rows with `lastUpdatedBlock` filled from their heights (null while the block is not indexed). */
async function withLastUpdated<T extends { lastUpdatedBlockId: string }>(
  network: NetworkId,
  rows: T[],
  revalidate: number,
): Promise<(Omit<T, 'lastUpdatedBlockId'> & { lastUpdatedBlock: { height: string; timestamp: string } | null })[]> {
  const times = await getBlockTimes(network, rows.map((r) => r.lastUpdatedBlockId), revalidate);
  return rows.map(({ lastUpdatedBlockId, ...r }) => {
    const timestamp = times.get(String(lastUpdatedBlockId));
    return { ...r, lastUpdatedBlock: timestamp ? { height: String(lastUpdatedBlockId), timestamp } : null };
  });
}

// ---- list ----
export async function getAccountList(network: NetworkId, limit: number, offset: number) {
  const data = await gqlFetch<{ balances: { nodes: (Omit<AccountListRow, 'lastUpdatedBlock'> & { lastUpdatedBlockId: string })[]; totalCount: number } }>(
    network,
    ACCOUNT_LIST,
    { limit, offset },
    { revalidate: 15 },
  );
  return { totalCount: data.balances.totalCount, nodes: await withLastUpdated(network, data.balances.nodes, 15) };
}

export async function getAccountSummary(network: NetworkId): Promise<AccountSummary> {
  const now = new Date();
  // Start of today (UTC), -30d, -90d — ISO Datetime strings for the indexer filters.
  const todayDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
  const monthDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const last90Date = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString();
  // A balance updated since a date is one whose last-updated height is past the newest block before it (-1: the chain
  // is younger than the date, so every balance counts).
  type Newest = { nodes: { id: string }[] };
  const h = await gqlFetch<{ today: Newest; month: Newest; last90: Newest }>(
    network,
    ACCOUNT_SUMMARY_HEIGHTS,
    { todayDate, monthDate, last90Date },
    { revalidate: 15 },
  );
  const height = (b: Newest) => b.nodes[0]?.id ?? '-1';
  const data = await gqlFetch<{
    accountsWithBalance: { totalCount: number };
    todayAccounts: { totalCount: number };
    monthAccounts: { totalCount: number };
    last90DaysAccounts: { totalCount: number };
  }>(
    network,
    ACCOUNT_SUMMARY,
    { todayHeight: height(h.today), monthHeight: height(h.month), last90Height: height(h.last90) },
    { revalidate: 15 },
  );
  return {
    accountsWithBalance: data.accountsWithBalance?.totalCount ?? null,
    todayAccounts: data.todayAccounts?.totalCount ?? null,
    monthAccounts: data.monthAccounts?.totalCount ?? null,
    last90DaysAccounts: data.last90DaysAccounts?.totalCount ?? null,
  };
}

/** Economic total supply (upokt) — the per-account share denominator. Best-effort; null on failure. */
export async function getTotalSupplyUpokt(network: NetworkId): Promise<number | null> {
  try {
    const end = new Date();
    // ~2-day window so a daily row always exists; take the latest (see getHomeSummary).
    const start = new Date(end.getTime() - 48 * 60 * 60 * 1000);
    const data = await gqlFetch<{ supply: { total_supply: number | null }[] | null }>(
      network,
      TOTAL_SUPPLY,
      { startDate: start.toISOString(), endDate: end.toISOString() },
      { revalidate: 15 },
    );
    const rows = data.supply ?? [];
    const latest = rows.length ? rows[rows.length - 1]?.total_supply : null;
    return latest != null && Number(latest) > 0 ? Number(latest) : null;
  } catch {
    return null;
  }
}

// ---- detail ----
// Raw shape of the ACCOUNT_ROLES response (pre-normalization).
interface AccountRolesResult {
  account: { id: string } | null;
  balances: { nodes: (Omit<AccountBalance, 'lastUpdatedBlock'> & { lastUpdatedBlockId: string })[] };
  supplier: Omit<SupplierRole, 'serviceConfigs'> | null;
  serviceConfigs: SupplierRole['serviceConfigs'];
  ownedOperators: { supplierCount: string | null; stakeUpokt: string | null }[] | null;
  asValidator: { nodes: ValidatorRoleLite[] };
  asApp: {
    id: string;
    stakeAmount: string | null;
    stakeStatus: string | null;
    unstakingReason: string | null;
    unstakingEndHeight: string | null;
  } | null;
  appServices: { totalCount: number };
  appGateways: { totalCount: number };
  asGateway: {
    id: string;
    stakeAmount: string | null;
    stakeStatus: string | null;
    unstakingEndHeight: string | null;
  } | null;
  gatewayApps: { totalCount: number };
  ownedServices: { totalCount: number; nodes: OwnedService[] };
  revShareRecipient: { totalCount: number };
}

/**
 * Resolve EVERY on-chain role an address holds, in one round-trip. Roles are additive — a multi-role
 * address (e.g. operator that is also a validator) returns all branches populated. See ACCOUNT_ROLES.
 */
export async function getAccountProfile(network: NetworkId, id: string): Promise<AccountProfile> {
  // rsMatch: JSON-containment probe — configs whose revShare[] include an entry for this address.
  // The staking delegation probe is LCD-only and independent of the roles query, so run it
  // alongside rather than after. A dead LCD costs us the delegation role, never the whole page.
  const [d, delegations] = await Promise.all([
    gqlFetch<AccountRolesResult>(network, ACCOUNT_ROLES, { id, ids: [id], rsMatch: [{ address: id }] }, { revalidate: 30 }),
    getDelegations(network, id).catch(() => null),
  ]);
  // The fleet function's whole-fleet row: every supplier the address owns now, any status, and their stake summed.
  const fleet = d.ownedOperators?.[0];
  const owner =
    Number(fleet?.supplierCount ?? 0) > 0 ? { operatorCount: Number(fleet!.supplierCount), totalStakeUpokt: fleet!.stakeUpokt ?? '0' } : null;
  const account = d.account ? { id: d.account.id, balances: { nodes: await withLastUpdated(network, d.balances?.nodes ?? [], 30) } } : null;
  return {
    account,
    supplier: d.supplier ? { ...d.supplier, serviceConfigs: d.serviceConfigs ?? { totalCount: 0, nodes: [] } } : null,
    owner,
    validator: d.asValidator?.nodes?.[0] ?? null,
    application: d.asApp
      ? {
          id: d.asApp.id,
          stakeAmount: d.asApp.stakeAmount,
          stakeStatus: d.asApp.stakeStatus,
          unstakingReason: d.asApp.unstakingReason,
          unstakingEndHeight: d.asApp.unstakingEndHeight,
          serviceCount: d.appServices?.totalCount ?? 0,
          delegatedGatewayCount: d.appGateways?.totalCount ?? 0,
        }
      : null,
    gateway: d.asGateway
      ? {
          id: d.asGateway.id,
          stakeAmount: d.asGateway.stakeAmount,
          stakeStatus: d.asGateway.stakeStatus,
          unstakingEndHeight: d.asGateway.unstakingEndHeight,
          delegatingAppCount: d.gatewayApps?.totalCount ?? 0,
        }
      : null,
    ownedServices: d.ownedServices?.nodes ?? [],
    ownedServiceCount: d.ownedServices?.totalCount ?? 0,
    revShareRecipientConfigs: d.revShareRecipient?.totalCount ?? 0,
    delegationCount: delegations?.rows.length ?? 0,
    delegatedUpokt: delegations?.totalUpokt ?? '0',
  };
}

/** Owner → operator nodes, paginated (newest-staked first). Powers the account "Operators" tab. */
export async function getOwnedOperators(network: NetworkId, id: string, limit: number, offset: number) {
  const data = await gqlFetch<{ suppliers: { totalCount: number; nodes: Omit<OwnedOperatorRow, 'serviceConfigs'>[] } }>(
    network,
    OWNED_OPERATORS,
    { id, limit, offset },
    { revalidate: 30 },
  );
  const counts = await getSupplierServiceCounts(network, data.suppliers.nodes.map((n) => n.id));
  return {
    totalCount: data.suppliers.totalCount,
    nodes: data.suppliers.nodes.map((n): OwnedOperatorRow => ({ ...n, serviceConfigs: { totalCount: counts.get(n.id) ?? 0 } })),
  };
}

/** Application → gateways it delegates to (paginated). Powers the account "Delegated Gateways" tab. */
export async function getAppDelegatedGateways(network: NetworkId, id: string, limit: number, offset: number) {
  const data = await gqlFetch<{ applicationGateways: { totalCount: number; nodes: { gatewayId: string }[] } }>(
    network,
    APP_DELEGATED_GATEWAYS,
    { id, limit, offset },
    { revalidate: 30 },
  );
  return data.applicationGateways;
}

/** Gateway → applications delegating to it (paginated). Powers the account "Delegating Apps" tab. */
export async function getGatewayDelegatingApps(network: NetworkId, id: string, limit: number, offset: number) {
  const data = await gqlFetch<{ applicationGateways: { totalCount: number; nodes: { applicationId: string }[] } }>(
    network,
    GATEWAY_DELEGATING_APPS,
    { id, limit, offset },
    { revalidate: 30 },
  );
  return data.applicationGateways;
}

/** Supplier service-configs that pay `id` a rev-share cut (paginated). Powers the "Rev-share" tab. */
export async function getRevShareConfigs(network: NetworkId, id: string, limit: number, offset: number) {
  const data = await gqlFetch<{ supplierServiceConfigs: { totalCount: number; nodes: RevShareConfigRow[] } }>(
    network,
    REVSHARE_RECIPIENT_CONFIGS,
    { rsMatch: [{ address: id }], limit, offset },
    { revalidate: 30 },
  );
  return data.supplierServiceConfigs;
}
