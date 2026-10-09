import { gqlFetch } from '@/lib/graphql';
import { lcdFetch } from '@/lib/lcd';
import type { NetworkId } from '@/lib/networks';
import { toBigInt } from '@/lib/format';
import { NOT_COVERED, coveredWindow, unwrapRange } from '@/lib/data/range';
import type { RevShareEntry, SupplierEndpoint } from '@/lib/data/accounts';
import {
  SUPPLIER_ROLE,
  SUPPLIER_PAYOUTS,
  SUPPLIER_HISTORY,
  OWNER_FLEET_IDS,
  FLEET_EARNINGS,
  SUPPLIER_SERVICE_EARNINGS,
  lastSettledQuery,
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
/** A fleet row: what the claims asked for, what was paid, and the difference lost to overservicing. */
export interface FleetSettlement extends ServiceSettlement {
  overservicedUpokt: string;
}

export interface FleetEarnings {
  fleetSize: number;
  /** Totals and `byService` cover the whole fleet; `bySupplier` lists the CONNECTION_CAP largest-staked operators. */
  totals: { claims: number; relays: number; claimedUpokt: string; settledUpokt: string; overservicedUpokt: string };
  bySupplier: FleetSettlement[];
  byService: FleetSettlement[];
  /** Where the settlement catalog's data starts, and the stretches inside it with nothing indexed (epoch ms). */
  dataSince: number | null;
  gaps: { from: number; to: number }[];
}

interface EarningsRow {
  supplier_id: string;
  service_id: string;
  relays: string | null;
  claimed_upokt: string | null;
  settled_upokt: string | null;
  overservicing_loss_upokt: string | null;
  settled_claims: string | null;
}

// The catalog sends every number as a JSON string (amounts can pass 2^53); amounts stay strings, summed as BigInt.
const amount = (v: string | null | undefined) => (v == null ? '0' : v);

function toEarnings(rows: EarningsRow[] | null, key: 'supplier_id' | 'service_id'): FleetSettlement[] {
  return (rows ?? []).map((r) => ({
    serviceId: r[key],
    relays: Number(r.relays ?? 0),
    claimedUpokt: amount(r.claimed_upokt),
    settledUpokt: amount(r.settled_upokt),
    overservicedUpokt: amount(r.overservicing_loss_upokt),
    lastBlock: 0,
  }));
}

/**
 * Lifetime settlement of every supplier an owner wallet owns now, from the settlement catalog (`owners`), so a fleet
 * larger than the connection cap is counted whole. Claimed is what the claims asked for, Settled what was paid after
 * overservicing (the claim event's claimedAmount is already the settled amount) and Overserviced the difference. The operator table lists the
 * CONNECTION_CAP largest-staked operators, each with the block of its latest settled claim (0 when unknown).
 * NOT_COVERED when the catalog has nothing indexed.
 */
export async function getFleetEarnings(network: NetworkId, ownerId: string): Promise<FleetEarnings | typeof NOT_COVERED> {
  const earnings = (bySupplier: boolean, byService: boolean) =>
    gqlFetch<{ getSupplierEarningsJson: unknown }>(network, FLEET_EARNINGS, { owners: [ownerId], bySupplier, byService }, { revalidate: 60 }).then(
      (d) => unwrapRange<EarningsRow[]>(d.getSupplierEarningsJson),
    );
  // The listed operators' latest settled blocks chain on the fleet ids, alongside the catalog reads; a failed lookup
  // leaves the column empty instead of failing the panel.
  const listedFleet = gqlFetch<{ suppliers: { totalCount: number; nodes: { id: string }[] } }>(
    network,
    OWNER_FLEET_IDS,
    { id: ownerId, limit: CONNECTION_CAP },
    { revalidate: 60 },
  ).then(async (fleet) => {
    const ids = fleet.suppliers?.nodes?.map((n) => n.id) ?? [];
    const last =
      ids.length === 0
        ? {}
        : await gqlFetch<Record<string, { nodes: { blockId: string }[] } | null>>(
            network,
            lastSettledQuery(ids.length),
            Object.fromEntries(ids.map((id, i) => [`s${i}`, id])),
            { revalidate: 60 },
          ).catch(() => ({}) as Record<string, { nodes: { blockId: string }[] } | null>);
    const lastBlock = new Map(ids.map((id, i) => [id, Number(last[`s${i}`]?.nodes?.[0]?.blockId ?? 0)]));
    return { fleetSize: fleet.suppliers?.totalCount ?? 0, lastBlock };
  });
  const [fleet, perSupplier, perService] = await Promise.all([listedFleet, earnings(true, false), earnings(false, true)]);
  // The totals are the By service rows summed: one fewer lifetime read, and the headline always matches the table.
  const window = coveredWindow(perService.range, -Infinity, Infinity);
  if (!window) return NOT_COVERED;
  const byService = toEarnings(perService.data, 'service_id');
  const sum = (k: 'claimed_upokt' | 'settled_upokt' | 'overservicing_loss_upokt') => (perService.data ?? []).reduce((t, r) => t + BigInt(amount(r[k])), 0n).toString();
  const bySupplier = toEarnings(perSupplier.data, 'supplier_id')
    .filter((s) => fleet.lastBlock.has(s.serviceId))
    .map((s) => ({ ...s, lastBlock: fleet.lastBlock.get(s.serviceId)! }));
  return {
    fleetSize: fleet.fleetSize,
    totals: {
      claims: (perService.data ?? []).reduce((t, r) => t + Number(r.settled_claims ?? 0), 0),
      relays: byService.reduce((t, r) => t + r.relays, 0),
      claimedUpokt: sum('claimed_upokt'),
      settledUpokt: sum('settled_upokt'),
      overservicedUpokt: sum('overservicing_loss_upokt'),
    },
    bySupplier: bySupplier.sort((a, b) => b.relays - a.relays),
    byService: byService.sort((a, b) => b.relays - a.relays),
    dataSince: perService.range && Number.isFinite(window.from) ? window.from : null,
    gaps: window.gaps,
  };
}

/** One supplier's lifetime settlement per service from the settlement catalog, most relays first, and where the
 *  catalog's data starts (null when it has every settlement). */
export async function getSupplierServiceEarningsCovered(
  network: NetworkId,
  supplierId: string,
): Promise<{ rows: FleetSettlement[]; dataSince: number | null }> {
  const d = await gqlFetch<{ getSupplierEarningsJson: unknown }>(network, SUPPLIER_SERVICE_EARNINGS, { suppliers: [supplierId] }, { revalidate: 60 });
  const { data, range } = unwrapRange<EarningsRow[]>(d.getSupplierEarningsJson);
  const window = coveredWindow(range, -Infinity, Infinity);
  return {
    rows: toEarnings(data, 'service_id').sort((a, b) => b.relays - a.relays),
    dataSince: range && window && Number.isFinite(window.from) ? window.from : null,
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
  /** Split by settlement family; see the query for why this is aliases and not a groupBy. */
  byReason: { reason: string; amountUpokt: string; transfers: number }[];
}

/** The two settlement families that pay a rev-share recipient. Order is display order. */
const INCOME_PARTS = [
  { key: 'relay', reason: 'TLM_RELAY_BURN_EQUALS_MINT_SUPPLIER_SHAREHOLDER_RD' },
  { key: 'mint', reason: 'TLM_GLOBAL_MINT_SUPPLIER_SHAREHOLDER_REWARD_DISTRIBUTION' },
] as const;

/**
 * Lifetime rev-share income for a recipient, across every supplier that pays it.
 *
 * Deliberately NOT scoped to the current page's suppliers. That scoping existed because a
 * recipient-only aggregate used to time out, which is true only without an opReason predicate —
 * with one the query is index-backed and ~11x faster than the by-reason grouping it replaces.
 * Dropping the supplier ids also keeps the cache key stable across pagination, so paging through
 * results no longer recomputes the figure every time.
 *
 * Cached longer than the page's other calls: a lifetime cumulative does not meaningfully change in
 * 60 seconds, and this is the most expensive call on the page by an order of magnitude.
 */
export async function getRevShareIncome(network: NetworkId, recipient: string): Promise<RevShareIncome> {
  type Part = { aggregates: { sum: { amount: string | null; transferCount: string | null } | null } | null } | null;
  const d = await gqlFetch<Record<string, Part>>(network, REVSHARE_INCOME_AMOUNTS, { recipient }, { revalidate: 300 });

  let total = BigInt(0);
  let transfers = 0;
  const byReason: RevShareIncome['byReason'] = [];
  for (const { key, reason } of INCOME_PARTS) {
    const sum = d[key]?.aggregates?.sum;
    const amountUpokt = sum?.amount ?? '0';
    // transferCount, NOT the connection's totalCount — these are roll-up rows, each standing for
    // several transfers. Counting rows would under-report by roughly half.
    const n = Number(toBigInt(sum?.transferCount));
    total += toBigInt(amountUpokt);
    transfers += n;
    if (n > 0) byReason.push({ reason, amountUpokt, transfers: n });
  }
  return { totalUpokt: total.toString(), transfers, byReason };
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
