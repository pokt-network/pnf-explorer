import { gqlFetch } from '@/lib/graphql';
import { lcdFetch } from '@/lib/lcd';
import type { NetworkId } from '@/lib/networks';
import type { RevShareEntry, SupplierEndpoint } from '@/lib/data/accounts';
import {
  SUPPLIER_ROLE,
  SUPPLIER_PAYOUTS,
  SUPPLIER_HISTORY,
  OWNER_FLEET_IDS,
  FLEET_EARNINGS,
  APPLICATION_ROLE,
  GATEWAY_ROLE,
  GATEWAY_TRAFFIC,
  SERVICE_OWNER_ROLE,
  REVSHARE_INCOME_AMOUNTS,
} from '@/lib/queries/roles';

// Role-view data layer (ROLE-VIEWS-DESIGN.md). Each fetcher backs ONE role of an address; the page
// calls only the active role's fetcher. Amounts stay strings (upokt) — formatting is the UI's job.

/** Connection cap on the indexer. Fleet/delegation id sets are truncated to this and labelled. */
export const CONNECTION_CAP = 100;

// ---- shared shapes ----
/** Settlement rollup for one serviceId (from `eventClaimSettleds.groupedAggregates`). */
export interface ServiceSettlement {
  serviceId: string;
  relays: number;
  claimedUpokt: string;
  settledUpokt: string;
  lastBlock: number;
}
export interface SettlementTotals {
  claims: number;
  relays: number;
  claimedUpokt: string;
  settledUpokt: string;
  mintedUpokt: string;
}

interface GroupedRow {
  keys: string[] | null;
  sum: { numRelays?: string | null; claimedAmount?: string | null; settledAmount?: string | null } | null;
  max?: { blockId?: string | null } | null;
}

function toSettlements(rows: GroupedRow[] | null | undefined): ServiceSettlement[] {
  return (rows ?? [])
    .filter((r) => r.keys?.[0])
    .map((r) => ({
      serviceId: r.keys![0],
      relays: Number(r.sum?.numRelays ?? 0),
      claimedUpokt: r.sum?.claimedAmount ?? '0',
      settledUpokt: r.sum?.settledAmount ?? '0',
      lastBlock: Number(r.max?.blockId ?? 0),
    }));
}

// ---- supplier (operator) ----
export interface SupplierServiceRow {
  serviceId: string;
  revShare: RevShareEntry[];
  endpoints: SupplierEndpoint[];
  /** Settlement rollup for this service; null when the supplier has never settled a claim on it. */
  settlement: ServiceSettlement | null;
}
export interface SupplierRoleView {
  id: string;
  operatorId: string;
  ownerId: string;
  stakeAmount: string | null;
  stakeStatus: string | null;
  unstakingReason: string | null;
  unstakingEndHeight: string | null;
  /** Currently-configured services, with their settlement rollup joined on. */
  services: SupplierServiceRow[];
  /** Services with settled claims but NO current config — earned on, no longer staked for. */
  formerServices: ServiceSettlement[];
  totals: SettlementTotals;
  slashCount: number;
  slashPenaltyUpokt: string;
  stakeMsgCount: number;
  unstakeMsgCount: number;
}

interface SupplierRoleResult {
  supplier: {
    id: string;
    operatorId: string;
    ownerId: string;
    stakeAmount: string | null;
    stakeStatus: string | null;
    unstakingReason: string | null;
    unstakingEndHeight: string | null;
    serviceConfigs: { totalCount: number; nodes: { serviceId: string; revShare: RevShareEntry[]; endpoints: SupplierEndpoint[] }[] };
    settled: {
      totalCount: number;
      aggregates: { sum: { numRelays: string | null; claimedAmount: string | null; settledAmount: string | null; mintedAmount: string | null } | null } | null;
      groupedAggregates: GroupedRow[] | null;
    };
    slashes: { totalCount: number; aggregates: { sum: { proofMissingPenalty: string | null } | null } | null };
    stakeMsgs: { totalCount: number };
    unstakeMsgs: { totalCount: number };
  } | null;
}

/**
 * The supplier actor's own state: current config joined to lifetime settlement, per service. This is
 * the single view the operator report asked for — service, endpoint, rev-share split and what it
 * actually earned, without leaving the page.
 */
export async function getSupplierRole(network: NetworkId, id: string): Promise<SupplierRoleView | null> {
  const d = await gqlFetch<SupplierRoleResult>(network, SUPPLIER_ROLE, { id }, { revalidate: 30 });
  const s = d.supplier;
  if (!s) return null;

  const settlements = toSettlements(s.settled?.groupedAggregates);
  const byService = new Map(settlements.map((x) => [x.serviceId, x]));
  const configured = s.serviceConfigs?.nodes ?? [];
  const configuredIds = new Set(configured.map((c) => c.serviceId));

  return {
    id: s.id,
    operatorId: s.operatorId,
    ownerId: s.ownerId,
    stakeAmount: s.stakeAmount,
    stakeStatus: s.stakeStatus,
    unstakingReason: s.unstakingReason,
    unstakingEndHeight: s.unstakingEndHeight,
    services: configured.map((c) => ({
      serviceId: c.serviceId,
      revShare: c.revShare ?? [],
      endpoints: c.endpoints ?? [],
      settlement: byService.get(c.serviceId) ?? null,
    })),
    formerServices: settlements.filter((x) => !configuredIds.has(x.serviceId)).sort((a, b) => b.relays - a.relays),
    totals: {
      claims: s.settled?.totalCount ?? 0,
      relays: Number(s.settled?.aggregates?.sum?.numRelays ?? 0),
      claimedUpokt: s.settled?.aggregates?.sum?.claimedAmount ?? '0',
      settledUpokt: s.settled?.aggregates?.sum?.settledAmount ?? '0',
      mintedUpokt: s.settled?.aggregates?.sum?.mintedAmount ?? '0',
    },
    slashCount: s.slashes?.totalCount ?? 0,
    slashPenaltyUpokt: s.slashes?.aggregates?.sum?.proofMissingPenalty ?? '0',
    stakeMsgCount: s.stakeMsgs?.totalCount ?? 0,
    unstakeMsgCount: s.unstakeMsgs?.totalCount ?? 0,
  };
}

/** One address's realised take from a supplier's settlements. */
export interface PayoutRow {
  address: string;
  amountUpokt: string;
  transfers: number;
}
export interface SupplierPayouts {
  rows: PayoutRow[];
  totalUpokt: string;
  totalTransfers: number;
}

interface SupplierPayoutsResult {
  modToAcctTransfers: {
    totalCount: number;
    aggregates: { sum: { amount: string | null } | null } | null;
    groupedAggregates: { keys: string[] | null; sum: { amount: string | null } | null; distinctCount: { id: string | null } | null }[] | null;
  } | null;
}

/**
 * Realised rev-share: every address this supplier's settlements have actually paid, largest first.
 * Diverges from the configured percentages whenever the config has changed — that divergence is the
 * point (a current-state view can't show an address that used to be a shareholder).
 */
export async function getSupplierPayouts(network: NetworkId, id: string): Promise<SupplierPayouts> {
  const d = await gqlFetch<SupplierPayoutsResult>(network, SUPPLIER_PAYOUTS, { id }, { revalidate: 60 });
  const c = d.modToAcctTransfers;
  const rows = (c?.groupedAggregates ?? [])
    .filter((g) => g.keys?.[0])
    .map((g) => ({ address: g.keys![0], amountUpokt: g.sum?.amount ?? '0', transfers: Number(g.distinctCount?.id ?? 0) }))
    .sort((a, b) => (BigInt(b.amountUpokt) > BigInt(a.amountUpokt) ? 1 : -1));
  return { rows, totalUpokt: c?.aggregates?.sum?.amount ?? '0', totalTransfers: c?.totalCount ?? 0 };
}

export interface SupplierStakeMsg {
  id: string;
  stakeAmount: string | null;
  blockId: string | null;
  transactionId: string | null;
}
export interface SupplierSlash {
  id: string;
  serviceId: string | null;
  blockId: string | null;
  proofMissingPenalty: string | null;
  previousStakeAmount: string | null;
  afterStakeAmount: string | null;
}
export interface SupplierHistory {
  stakeMsgs: { totalCount: number; nodes: SupplierStakeMsg[] };
  unstakeMsgs: { totalCount: number; nodes: { id: string; blockId: string | null; transactionId: string | null }[] };
  slashes: { totalCount: number; nodes: SupplierSlash[] };
}

/** Supplier lifecycle for the History tab: stake edits, unstake msgs, slashes. Newest first. */
export async function getSupplierHistory(network: NetworkId, id: string, limit: number): Promise<SupplierHistory | null> {
  const d = await gqlFetch<{ supplier: SupplierHistory | null }>(network, SUPPLIER_HISTORY, { id, limit }, { revalidate: 30 });
  return d.supplier ?? null;
}

// ---- supplier owner (fleet) ----
export interface FleetEarnings {
  /** Operator count covered by the rollup (may be < the full fleet — see `truncated`). */
  covered: number;
  fleetSize: number;
  truncated: boolean;
  totals: { claims: number; relays: number; claimedUpokt: string; settledUpokt: string };
  bySupplier: ServiceSettlement[];
  byService: ServiceSettlement[];
}

/**
 * Fleet-wide settlement for an owner wallet. Goes through the fleet's supplier ids — NOT
 * `supplierOwnerId`, which is a newer field present on only ~25% of claim events and under-reports
 * by ~20× (design doc §5.1).
 */
export async function getFleetEarnings(network: NetworkId, ownerId: string): Promise<FleetEarnings> {
  const fleet = await gqlFetch<{ suppliers: { totalCount: number; nodes: { id: string }[] } }>(
    network,
    OWNER_FLEET_IDS,
    { id: ownerId, limit: CONNECTION_CAP },
    { revalidate: 30 },
  );
  const ids = fleet.suppliers?.nodes?.map((n) => n.id) ?? [];
  const fleetSize = fleet.suppliers?.totalCount ?? 0;
  const empty = { claims: 0, relays: 0, claimedUpokt: '0', settledUpokt: '0' };
  if (ids.length === 0) {
    return { covered: 0, fleetSize, truncated: false, totals: empty, bySupplier: [], byService: [] };
  }

  const d = await gqlFetch<{
    eventClaimSettleds: {
      totalCount: number;
      aggregates: { sum: { numRelays: string | null; claimedAmount: string | null; settledAmount: string | null } | null } | null;
      bySupplier: GroupedRow[] | null;
      byService: GroupedRow[] | null;
    };
  }>(network, FLEET_EARNINGS, { ids }, { revalidate: 60 });

  const c = d.eventClaimSettleds;
  return {
    covered: ids.length,
    fleetSize,
    truncated: fleetSize > ids.length,
    totals: {
      claims: c?.totalCount ?? 0,
      relays: Number(c?.aggregates?.sum?.numRelays ?? 0),
      claimedUpokt: c?.aggregates?.sum?.claimedAmount ?? '0',
      settledUpokt: c?.aggregates?.sum?.settledAmount ?? '0',
    },
    // `bySupplier` reuses ServiceSettlement — its `serviceId` field carries the operator address.
    bySupplier: toSettlements(c?.bySupplier).sort((a, b) => b.relays - a.relays),
    byService: toSettlements(c?.byService).sort((a, b) => b.relays - a.relays),
  };
}

// ---- application ----
export interface ApplicationRoleView {
  id: string;
  stakeAmount: string | null;
  stakeStatus: string | null;
  unstakingReason: string | null;
  unstakingEndHeight: string | null;
  transferringToId: string | null;
  transferEndHeight: string | null;
  services: string[];
  gatewayCount: number;
  /** Claim amounts on an application are SPEND (stake burned to pay suppliers), not income. */
  totals: { claims: number; relays: number; claimedUpokt: string; settledUpokt: string };
  byService: ServiceSettlement[];
  overservicedCount: number;
}

interface ApplicationRoleResult {
  application: {
    id: string;
    stakeAmount: string | null;
    stakeStatus: string | null;
    unstakingReason: string | null;
    unstakingEndHeight: string | null;
    transferringToId: string | null;
    transferEndHeight: string | null;
    applicationServices: { totalCount: number; nodes: { serviceId: string }[] };
    applicationGateways: { totalCount: number };
    settled: {
      totalCount: number;
      aggregates: { sum: { numRelays: string | null; claimedAmount: string | null; settledAmount: string | null } | null } | null;
      groupedAggregates: GroupedRow[] | null;
    };
    overserviced: { totalCount: number };
  } | null;
}

export async function getApplicationRole(network: NetworkId, id: string): Promise<ApplicationRoleView | null> {
  const d = await gqlFetch<ApplicationRoleResult>(network, APPLICATION_ROLE, { id }, { revalidate: 30 });
  const a = d.application;
  if (!a) return null;
  return {
    id: a.id,
    stakeAmount: a.stakeAmount,
    stakeStatus: a.stakeStatus,
    unstakingReason: a.unstakingReason,
    unstakingEndHeight: a.unstakingEndHeight,
    transferringToId: a.transferringToId,
    transferEndHeight: a.transferEndHeight,
    services: a.applicationServices?.nodes?.map((n) => n.serviceId) ?? [],
    gatewayCount: a.applicationGateways?.totalCount ?? 0,
    totals: {
      claims: a.settled?.totalCount ?? 0,
      relays: Number(a.settled?.aggregates?.sum?.numRelays ?? 0),
      claimedUpokt: a.settled?.aggregates?.sum?.claimedAmount ?? '0',
      settledUpokt: a.settled?.aggregates?.sum?.settledAmount ?? '0',
    },
    byService: toSettlements(a.settled?.groupedAggregates).sort((x, y) => y.relays - x.relays),
    overservicedCount: a.overserviced?.totalCount ?? 0,
  };
}

// ---- gateway ----
export interface GatewayRoleView {
  id: string;
  stakeAmount: string | null;
  stakeStatus: string | null;
  unstakingEndHeight: string | null;
  appCount: number;
  /** Delegating app ids, capped at CONNECTION_CAP (see `truncated`). */
  appIds: string[];
  truncated: boolean;
  delegationMsgs: number;
  undelegationMsgs: number;
}

export async function getGatewayRole(network: NetworkId, id: string): Promise<GatewayRoleView | null> {
  const d = await gqlFetch<{
    gateway: {
      id: string;
      stakeAmount: string | null;
      stakeStatus: string | null;
      unstakingEndHeight: string | null;
      applicationGateways: { totalCount: number; nodes: { applicationId: string }[] };
      delegations: { totalCount: number };
      undelegations: { totalCount: number };
    } | null;
  }>(network, GATEWAY_ROLE, { id, limit: CONNECTION_CAP }, { revalidate: 30 });
  const g = d.gateway;
  if (!g) return null;
  const appIds = g.applicationGateways?.nodes?.map((n) => n.applicationId) ?? [];
  return {
    id: g.id,
    stakeAmount: g.stakeAmount,
    stakeStatus: g.stakeStatus,
    unstakingEndHeight: g.unstakingEndHeight,
    appCount: g.applicationGateways?.totalCount ?? 0,
    appIds,
    truncated: (g.applicationGateways?.totalCount ?? 0) > appIds.length,
    delegationMsgs: g.delegations?.totalCount ?? 0,
    undelegationMsgs: g.undelegations?.totalCount ?? 0,
  };
}

export interface GatewayTraffic {
  totals: { claims: number; relays: number; claimedUpokt: string };
  byService: ServiceSettlement[];
}

/**
 * Traffic routed through a gateway, derived from the settled claims of the apps that delegate to it.
 * The signing gateway is never recorded on-chain, so this is authorized-routing inference (the same
 * basis as the supplier Traffic tab), not proof — label it as such in the UI.
 */
export async function getGatewayTraffic(network: NetworkId, appIds: string[]): Promise<GatewayTraffic> {
  if (appIds.length === 0) return { totals: { claims: 0, relays: 0, claimedUpokt: '0' }, byService: [] };
  const d = await gqlFetch<{
    eventClaimSettleds: {
      totalCount: number;
      aggregates: { sum: { numRelays: string | null; claimedAmount: string | null } | null } | null;
      byService: GroupedRow[] | null;
    };
  }>(network, GATEWAY_TRAFFIC, { ids: appIds }, { revalidate: 60 });
  const c = d.eventClaimSettleds;
  return {
    totals: {
      claims: c?.totalCount ?? 0,
      relays: Number(c?.aggregates?.sum?.numRelays ?? 0),
      claimedUpokt: c?.aggregates?.sum?.claimedAmount ?? '0',
    },
    byService: toSettlements(c?.byService).sort((a, b) => b.relays - a.relays),
  };
}

// ---- service owner ----
export interface OwnedServiceRow {
  id: string;
  name: string | null;
  computeUnitsPerRelay: string | number | null;
  supplierCount: number;
  appCount: number;
}

export async function getOwnedServices(network: NetworkId, id: string, limit: number, offset: number) {
  const d = await gqlFetch<{
    services: {
      totalCount: number;
      nodes: {
        id: string;
        name: string | null;
        computeUnitsPerRelay: string | number | null;
        supplierServiceConfigs: { totalCount: number };
        applicationServices: { totalCount: number };
      }[];
    };
  }>(network, SERVICE_OWNER_ROLE, { id, limit, offset }, { revalidate: 60 });
  return {
    totalCount: d.services?.totalCount ?? 0,
    nodes: (d.services?.nodes ?? []).map((s) => ({
      id: s.id,
      name: s.name,
      computeUnitsPerRelay: s.computeUnitsPerRelay,
      supplierCount: s.supplierServiceConfigs?.totalCount ?? 0,
      appCount: s.applicationServices?.totalCount ?? 0,
    })),
  };
}

// ---- rev-share income (reverse lookup) ----
export interface RevShareIncome {
  totalUpokt: string;
  transfers: number;
  byReason: { reason: string; amountUpokt: string }[];
}

/**
 * What this address has actually received from a given set of paying suppliers. Constrained to the
 * page's suppliers on purpose — a recipientId-only aggregate over the whole transfer table times out
 * server-side (design doc §5.2).
 */
export async function getRevShareIncome(network: NetworkId, recipient: string, supplierIds: string[]): Promise<RevShareIncome> {
  if (supplierIds.length === 0) return { totalUpokt: '0', transfers: 0, byReason: [] };
  const d = await gqlFetch<{
    modToAcctTransfers: {
      totalCount: number;
      aggregates: { sum: { amount: string | null } | null } | null;
      byReason: { keys: string[] | null; sum: { amount: string | null } | null }[] | null;
    } | null;
  }>(network, REVSHARE_INCOME_AMOUNTS, { recipient, supplierIds }, { revalidate: 60 });
  const c = d.modToAcctTransfers;
  return {
    totalUpokt: c?.aggregates?.sum?.amount ?? '0',
    transfers: c?.totalCount ?? 0,
    byReason: (c?.byReason ?? [])
      .filter((g) => g.keys?.[0])
      .map((g) => ({ reason: g.keys![0], amountUpokt: g.sum?.amount ?? '0' }))
      .sort((a, b) => (BigInt(b.amountUpokt) > BigInt(a.amountUpokt) ? 1 : -1)),
  };
}

// ---- LCD raw records (per-role Raw tabs) ----
// The chain's own record for each actor — the thing the operator report asked for when it said the
// Raw tab "does not give me the raw of the supplier". Each actor has its own module endpoint; the
// account's Raw stays the indexer balance record.
const LCD_PATH = {
  supplier: (id: string) => `/pokt-network/poktroll/supplier/supplier/${id}`,
  application: (id: string) => `/pokt-network/poktroll/application/application/${id}`,
  gateway: (id: string) => `/pokt-network/poktroll/gateway/gateway/${id}`,
} as const;

/** Fetch an actor's on-chain record from the LCD. Returns null when the chain has no such actor. */
export async function getActorRaw(
  network: NetworkId,
  actor: keyof typeof LCD_PATH,
  id: string,
): Promise<unknown | null> {
  try {
    return await lcdFetch<unknown>(network, LCD_PATH[actor](id), { revalidate: 30 });
  } catch {
    return null;
  }
}
