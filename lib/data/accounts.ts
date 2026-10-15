import { gqlFetch } from '@/lib/graphql';
import { getDelegations } from '@/lib/data/delegations';
import { firstPerId } from '@/lib/data/range';
import { fleetPage } from '@/lib/data/suppliers';
import { roundedNow } from '@/lib/data/window';
import type { NetworkId } from '@/lib/networks';
import {
  ACCOUNT_LIST,
  ACCOUNT_SUMMARY,
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
  /** The list shows the height alone, so no block-time read is made for it. */
  lastUpdatedBlock: { height: string } | null;
}

export interface AccountBalance {
  amount: string;
  denom: string;
  /** The height alone: the account view reads its time when it renders it (getBlockTimes), no other view needs it. */
  lastUpdatedBlock: { height: string } | null;
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

// ---- list ----
export async function getAccountList(network: NetworkId, limit: number, offset: number) {
  const data = await gqlFetch<{ balances: { nodes: (Omit<AccountListRow, 'lastUpdatedBlock'> & { lastUpdatedBlockId: string })[]; totalCount: number } }>(
    network,
    ACCOUNT_LIST,
    { limit, offset },
    { revalidate: 15 },
  );
  return {
    totalCount: data.balances.totalCount,
    nodes: data.balances.nodes.map(({ lastUpdatedBlockId, ...r }): AccountListRow => ({ ...r, lastUpdatedBlock: { height: String(lastUpdatedBlockId) } })),
  };
}

export async function getAccountSummary(network: NetworkId): Promise<AccountSummary> {
  const now = new Date(roundedNow()); // a stable cache key for the minute
  // Start of today (UTC), -30d, -90d, in one request with the accounts that hold a balance.
  const times = [
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    now.getTime() - 30 * 24 * 60 * 60 * 1000,
    now.getTime() - 90 * 24 * 60 * 60 * 1000,
  ];
  const data = await gqlFetch<{
    accountsWithBalance: { totalCount: number };
    active: { sinceTime: string; beyondTip: boolean | null; accounts: string | null }[] | null;
  }>(network, ACCOUNT_SUMMARY, { sinceTimes: times.map((t) => new Date(t).toISOString()) }, { revalidate: 15 });
  // Matched by time, not by position. A date past the indexed tip has no count yet: unknown, not 0.
  const active = (t: number) => {
    const row = (data.active ?? []).find((r) => Date.parse(r.sinceTime) === t);
    return row && !row.beyondTip && row.accounts != null ? Number(row.accounts) : null;
  };
  return {
    accountsWithBalance: data.accountsWithBalance?.totalCount ?? null,
    todayAccounts: active(times[0]),
    monthAccounts: active(times[1]),
    last90DaysAccounts: active(times[2]),
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
  const account = d.account
    ? {
        id: d.account.id,
        balances: { nodes: (d.balances?.nodes ?? []).map(({ lastUpdatedBlockId, ...b }) => ({ ...b, lastUpdatedBlock: { height: String(lastUpdatedBlockId) } })) },
      }
    : null;
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

/** Owner → operator nodes, paginated (largest stake first, then id). Powers the account "Operators" tab. */
export async function getOwnedOperators(network: NetworkId, id: string, limit: number, offset: number) {
  type Row = { supplierId: string; stakeStatus: string | null; stakeUpokt: string | null; serviceCount: string | null };
  const { rows, extra: totalCount } = await fleetPage<Row, number>(
    (rowLimit, first, skip) =>
      gqlFetch<{ getSupplierFleetList: Row[] | null; suppliers: { totalCount: number } }>(
        network,
        OWNED_OPERATORS,
        { id, ids: [id], rowLimit, limit: first, offset: skip },
        { revalidate: 30 },
      ).then((d) => ({ rows: d.getSupplierFleetList ?? [], extra: d.suppliers.totalCount })),
    limit,
    offset,
  );
  return {
    totalCount,
    nodes: firstPerId(rows, (s) => s.supplierId).map(
      (s): OwnedOperatorRow => ({ id: s.supplierId, stakeStatus: s.stakeStatus, stakeAmount: s.stakeUpokt, serviceConfigs: { totalCount: Number(s.serviceCount ?? 0) } }),
    ),
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
