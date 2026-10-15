import { gqlFetch } from '@/lib/graphql';
import { lcdFetch } from '@/lib/lcd';
import type { NetworkId } from '@/lib/networks';
import { toBigInt } from '@/lib/format';
import { NOT_COVERED, lifetimeCoverage as coverage, unwrapRange, type Coverage } from '@/lib/data/range';
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

/** Connection cap on the indexer. The owner fleet's operator table is truncated to this and labelled. */
export const CONNECTION_CAP = 100;

// ---- shared shapes ----
/** Settlement rollup for one serviceId (from the settlement catalog's per-service rows). */
export interface ServiceSettlement {
  serviceId: string;
  relays: number;
  claimedUpokt: string;
  settledUpokt: string;
  /** The height of the service's latest settled claim; null while the catalog cannot vouch for one. */
  lastBlock: number | null;
}
export interface SettlementTotals {
  claims: number;
  relays: number;
  claimedUpokt: string;
  settledUpokt: string;
}


/** A catalog amount summed over rows: amounts are JSON strings (they can pass 2^53), summed as BigInt. */
function sumAmount<T>(rows: T[], pick: (r: T) => string | null | undefined): string {
  return rows.reduce((t, r) => t + BigInt(amount(pick(r))), BigInt(0)).toString();
}

// ---- supplier (operator) ----
export interface SupplierServiceRow {
  serviceId: string;
  revShare: RevShareEntry[];
  endpoints: SupplierEndpoint[];
  /** Settlement rollup for this service; null when the supplier has never settled a claim on it. */
  settlement: ServiceSettlement | null;
}
export interface SupplierRoleView extends Coverage {
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
  } | null;
  serviceConfigs: { totalCount: number; nodes: { serviceId: string; revShare: RevShareEntry[]; endpoints: SupplierEndpoint[] }[] } | null;
  settled: unknown;
  penalties: unknown;
}

/**
 * The supplier actor's own state: current config joined to lifetime settlement, per service. This is
 * the single view the operator report asked for — service, endpoint, rev-share split and what it
 * actually earned, without leaving the page. Lifetime = the span the settlement catalog covers.
 */
export async function getSupplierRole(network: NetworkId, id: string): Promise<SupplierRoleView | null> {
  const d = await gqlFetch<SupplierRoleResult>(network, SUPPLIER_ROLE, { id, ids: [id] }, { revalidate: 30 });
  const s = d.supplier;
  if (!s) return null;

  const settled = unwrapRange<EarningsRow[]>(d.settled);
  const rows = settled.data ?? [];
  const settlements = toEarnings(rows, 'service_id');
  const byService = new Map(settlements.map((x) => [x.serviceId, x]));
  const configured = d.serviceConfigs?.nodes ?? [];
  const configuredIds = new Set(configured.map((c) => c.serviceId));
  // The penalties function's slashes, every reason summed (its other kinds are expired and discarded claims).
  const slashes = (unwrapRange<{ kind: string; events: string | null; slashed_upokt: string | null }[]>(d.penalties).data ?? []).filter(
    (p) => p.kind === 'slashed',
  );

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
      claims: rows.reduce((t, r) => t + Number(r.settled_claims ?? 0), 0),
      relays: settlements.reduce((t, r) => t + r.relays, 0),
      claimedUpokt: sumAmount(rows, (r) => r.claimed_upokt),
      settledUpokt: sumAmount(rows, (r) => r.settled_upokt),
    },
    slashCount: slashes.reduce((t, p) => t + Number(p.events ?? 0), 0),
    slashPenaltyUpokt: sumAmount(slashes, (p) => p.slashed_upokt),
    ...coverage(settled.range),
  };
}

/** One address's realised take from a supplier's settlements. `address` 'all' is the stakers' share, in one row. */
export interface PayoutRow {
  address: string;
  amountUpokt: string;
  /** The catalog's transfer_count: payout transfers to the address, but for the stakers row ('all') the settled
   *  claims that paid them. Not summable across rows. */
  transfers: number;
}
export interface SupplierPayouts extends Coverage {
  rows: PayoutRow[];
  totalUpokt: string;
}

/**
 * Realised rev-share: every address this supplier's settlements have actually paid, largest first.
 * Diverges from the configured percentages whenever the config has changed — that divergence is the
 * point (a current-state view can't show an address that used to be a shareholder). An address paid
 * in several roles (shareholder and DAO, say) is one row.
 */
export async function getSupplierPayouts(network: NetworkId, id: string): Promise<SupplierPayouts> {
  const d = await gqlFetch<{ getSupplierDistributionJson: unknown }>(network, SUPPLIER_PAYOUTS, { ids: [id] }, { revalidate: 60 });
  const { data, range } = unwrapRange<{ recipient_id: string; amount_upokt: string | null; transfer_count: string | null }[]>(
    d.getSupplierDistributionJson,
  );
  const byRecipient = new Map<string, { amount: bigint; transfers: number }>();
  for (const r of data ?? []) {
    const cur = byRecipient.get(r.recipient_id) ?? { amount: BigInt(0), transfers: 0 };
    byRecipient.set(r.recipient_id, { amount: cur.amount + BigInt(amount(r.amount_upokt)), transfers: cur.transfers + Number(r.transfer_count ?? 0) });
  }
  const rows = [...byRecipient]
    .map(([address, r]) => ({ address, amountUpokt: r.amount.toString(), transfers: r.transfers }))
    .sort((a, b) => (BigInt(b.amountUpokt) > BigInt(a.amountUpokt) ? 1 : -1));
  return {
    rows,
    totalUpokt: sumAmount(rows, (r) => r.amountUpokt),
    ...coverage(range),
  };
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
/** The newest rows of one kind; `more` when older ones exist past the limit. */
export interface HistoryList<T> {
  nodes: T[];
  more: boolean;
}
export interface SupplierHistory {
  stakeMsgs: HistoryList<SupplierStakeMsg>;
  unstakeMsgs: HistoryList<{ id: string; blockId: string | null; transactionId: string | null }>;
  slashes: HistoryList<SupplierSlash>;
}

/** Supplier lifecycle for the History tab: stake edits, unstake msgs, slashes. Newest first. */
export async function getSupplierHistory(network: NetworkId, id: string, limit: number): Promise<SupplierHistory | null> {
  type Row = {
    id: string;
    height: string;
    stakeUpokt?: string | null;
    transactionId?: string | null;
    serviceId?: string | null;
    penaltyUpokt?: string | null;
    previousStakeUpokt?: string | null;
  };
  // One row past the limit says whether there are more.
  const d = await gqlFetch<{ stakeMsgs: Row[] | null; unstakeMsgs: Row[] | null; slashes: Row[] | null }>(
    network,
    SUPPLIER_HISTORY,
    { ids: [id], rowLimit: limit + 1 },
    { revalidate: 30 },
  );
  const list = <T,>(rows: Row[] | null, map: (r: Row) => T): HistoryList<T> => ({ nodes: (rows ?? []).slice(0, limit).map(map), more: (rows ?? []).length > limit });
  return {
    stakeMsgs: list(d.stakeMsgs, (r) => ({ id: r.id, stakeAmount: r.stakeUpokt ?? null, blockId: r.height, transactionId: r.transactionId ?? null })),
    unstakeMsgs: list(d.unstakeMsgs, (r) => ({ id: r.id, blockId: r.height, transactionId: r.transactionId ?? null })),
    slashes: list(d.slashes, (r) => ({
      id: r.id,
      serviceId: r.serviceId ?? null,
      blockId: r.height,
      proofMissingPenalty: r.penaltyUpokt ?? null,
      previousStakeAmount: r.previousStakeUpokt ?? null,
      afterStakeAmount: r.stakeUpokt ?? null,
    })),
  };
}

// ---- supplier owner (fleet) ----
/** A fleet row: what the claims asked for, what was paid, and the difference lost to overservicing. */
export interface FleetSettlement extends ServiceSettlement {
  overservicedUpokt: string;
}

export interface FleetEarnings extends Coverage {
  fleetSize: number;
  /** Totals and `byService` cover the whole fleet; `bySupplier` lists the CONNECTION_CAP largest-staked operators. */
  totals: { claims: number; relays: number; claimedUpokt: string; settledUpokt: string; overservicedUpokt: string };
  bySupplier: FleetSettlement[];
  byService: FleetSettlement[];
}

interface EarningsRow {
  supplier_id: string;
  service_id: string;
  relays: string | null;
  claimed_upokt: string | null;
  settled_upokt: string | null;
  overservicing_loss_upokt: string | null;
  settled_claims: string | null;
  /** The height of the group's latest settled claim; null while the catalog cannot vouch for it (bounds not filled). */
  last_settled_height: string | null;
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
    lastBlock: r.last_settled_height == null ? null : Number(r.last_settled_height),
  }));
}

/**
 * Lifetime settlement of every supplier an owner wallet owns now, from the settlement catalog (`owners`), so a fleet
 * larger than the connection cap is counted whole. Claimed is what the claims asked for, Settled what was paid after
 * overservicing (the claim event's claimedAmount is already the settled amount) and Overserviced the difference. The operator table lists the
 * CONNECTION_CAP largest-staked operators; it and By service carry each row's last settled height from the catalog (null
 * when it cannot vouch for one). NOT_COVERED when the catalog has nothing indexed.
 */
export async function getFleetEarnings(network: NetworkId, ownerId: string): Promise<FleetEarnings | typeof NOT_COVERED> {
  const earnings = (bySupplier: boolean, byService: boolean) =>
    gqlFetch<{ getSupplierEarningsJson: unknown }>(network, FLEET_EARNINGS, { owners: [ownerId], bySupplier, byService }, { revalidate: 60 }).then(
      (d) => unwrapRange<EarningsRow[]>(d.getSupplierEarningsJson),
    );
  // The listed operators: the CONNECTION_CAP largest-staked of the fleet, alongside the catalog reads.
  const listedFleet = gqlFetch<{ suppliers: { totalCount: number; nodes: { id: string }[] } }>(
    network,
    OWNER_FLEET_IDS,
    { id: ownerId, limit: CONNECTION_CAP },
    { revalidate: 60 },
  ).then((fleet) => ({ fleetSize: fleet.suppliers?.totalCount ?? 0, ids: new Set(fleet.suppliers?.nodes?.map((n) => n.id) ?? []) }));
  const [fleet, perSupplier, perService] = await Promise.all([listedFleet, earnings(true, false), earnings(false, true)]);
  // The totals are the By service rows summed: one fewer lifetime read, and the headline always matches the table.
  const cover = coverage(perService.range);
  if (cover.notCovered) return NOT_COVERED;
  const rows = perService.data ?? [];
  const byService = toEarnings(rows, 'service_id');
  const bySupplier = toEarnings(perSupplier.data, 'supplier_id').filter((s) => fleet.ids.has(s.serviceId));
  return {
    fleetSize: fleet.fleetSize,
    totals: {
      claims: rows.reduce((t, r) => t + Number(r.settled_claims ?? 0), 0),
      relays: byService.reduce((t, r) => t + r.relays, 0),
      claimedUpokt: sumAmount(rows, (r) => r.claimed_upokt),
      settledUpokt: sumAmount(rows, (r) => r.settled_upokt),
      overservicedUpokt: sumAmount(rows, (r) => r.overservicing_loss_upokt),
    },
    bySupplier: bySupplier.sort((a, b) => b.relays - a.relays),
    byService: byService.sort((a, b) => b.relays - a.relays),
    ...cover,
  };
}

// ---- application ----
export interface ApplicationRoleView extends Coverage {
  id: string;
  stakeAmount: string | null;
  stakeStatus: string | null;
  unstakingReason: string | null;
  unstakingEndHeight: string | null;
  transferringToId: string | null;
  transferEndHeight: string | null;
  services: string[];
  gatewayCount: number;
  /** Claim amounts on an application are SPEND (stake burned to pay suppliers), not income: `claimedUpokt` (and, per
   *  service, `settledUpokt`) is what the application paid. */
  totals: { claims: number; relays: number; claimedUpokt: string };
  byService: ServiceSettlement[];
  /** Work suppliers did beyond what the application could pay, never paid. */
  overservicedUpokt: string;
}

interface SpendRow {
  service_id: string;
  burned_upokt: string | null;
  overserviced_unpaid_upokt: string | null;
  relays: string | null;
  claims: string | null;
  last_settled_height: string | null;
}

function toSpend(rows: SpendRow[]): ServiceSettlement[] {
  return rows.map((r) => ({
    serviceId: r.service_id,
    relays: Number(r.relays ?? 0),
    claimedUpokt: amount(r.burned_upokt),
    settledUpokt: amount(r.burned_upokt),
    lastBlock: r.last_settled_height == null ? null : Number(r.last_settled_height),
  }));
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
  } | null;
  services: { totalCount: number; nodes: { serviceId: string }[] } | null;
  gateways: { totalCount: number } | null;
  spend: unknown;
}

export async function getApplicationRole(network: NetworkId, id: string): Promise<ApplicationRoleView | null> {
  const d = await gqlFetch<ApplicationRoleResult>(network, APPLICATION_ROLE, { id, ids: [id] }, { revalidate: 30 });
  const a = d.application;
  if (!a) return null;
  const spend = unwrapRange<SpendRow[]>(d.spend);
  const rows = spend.data ?? [];
  const byService = toSpend(rows);
  return {
    id: a.id,
    stakeAmount: a.stakeAmount,
    stakeStatus: a.stakeStatus,
    unstakingReason: a.unstakingReason,
    unstakingEndHeight: a.unstakingEndHeight,
    transferringToId: a.transferringToId,
    transferEndHeight: a.transferEndHeight,
    services: d.services?.nodes?.map((n) => n.serviceId) ?? [],
    gatewayCount: d.gateways?.totalCount ?? 0,
    totals: {
      claims: rows.reduce((t, r) => t + Number(r.claims ?? 0), 0),
      relays: byService.reduce((t, r) => t + r.relays, 0),
      claimedUpokt: sumAmount(rows, (r) => r.burned_upokt),
    },
    byService: byService.sort((x, y) => y.relays - x.relays),
    overservicedUpokt: sumAmount(rows, (r) => r.overserviced_unpaid_upokt),
    ...coverage(spend.range),
  };
}

// ---- gateway ----
export interface GatewayRoleView {
  id: string;
  stakeAmount: string | null;
  stakeStatus: string | null;
  unstakingEndHeight: string | null;
  appCount: number;
  /** Delegate and undelegate messages the gateway ever received (a re-delegation counts again; a delegation from the
   *  genesis state has no message). Null when the fleet function has no row for it: unknown, not 0. */
  delegationMsgs: number | null;
  undelegationMsgs: number | null;
}

export async function getGatewayRole(network: NetworkId, id: string): Promise<GatewayRoleView | null> {
  const d = await gqlFetch<{
    gateway: {
      id: string;
      stakeAmount: string | null;
      stakeStatus: string | null;
      unstakingEndHeight: string | null;
    } | null;
    fleet: { delegatedApplications: string | null; delegationsEver: string | null; undelegationsEver: string | null }[] | null;
  }>(network, GATEWAY_ROLE, { id, ids: [id] }, { revalidate: 30 });
  const g = d.gateway;
  if (!g) return null;
  const f = d.fleet?.[0];
  return {
    id: g.id,
    stakeAmount: g.stakeAmount,
    stakeStatus: g.stakeStatus,
    unstakingEndHeight: g.unstakingEndHeight,
    appCount: Number(f?.delegatedApplications ?? 0),
    delegationMsgs: f ? Number(f.delegationsEver ?? 0) : null,
    undelegationMsgs: f ? Number(f.undelegationsEver ?? 0) : null,
  };
}

export interface GatewayTraffic extends Coverage {
  totals: { claims: number; relays: number; claimedUpokt: string };
  byService: ServiceSettlement[];
}

/**
 * Traffic routed through a gateway: the settled claims of the apps delegated to it, by the delegation
 * in force at each settlement height (the settlement catalog's gateway spend). The signing gateway is
 * never recorded on-chain, so this is authorized-routing inference (the same basis as the supplier
 * Traffic tab), not proof — label it as such in the UI. `claimedUpokt` is what those apps paid.
 */
export async function getGatewayTraffic(network: NetworkId, gatewayId: string): Promise<GatewayTraffic> {
  const d = await gqlFetch<{ getGatewaySpendJson: unknown }>(network, GATEWAY_TRAFFIC, { ids: [gatewayId] }, { revalidate: 60 });
  const spend = unwrapRange<SpendRow[]>(d.getGatewaySpendJson);
  const rows = spend.data ?? [];
  const byService = toSpend(rows);
  return {
    totals: {
      claims: rows.reduce((t, r) => t + Number(r.claims ?? 0), 0),
      relays: byService.reduce((t, r) => t + r.relays, 0),
      claimedUpokt: sumAmount(rows, (r) => r.burned_upokt),
    },
    byService: byService.sort((a, b) => b.relays - a.relays),
    ...coverage(spend.range),
  };
}

// ---- service owner ----
export interface OwnedServiceRow {
  id: string;
  name: string | null;
  computeUnitsPerRelay: string | number | null;
  /** Null when unknown (see getOwnedServices). */
  supplierCount: number | null;
  appCount: number | null;
}

/** Summary rows asked for an owner's services (all of them, with counts). */
const OWNER_COUNT_LIMIT = 1000;

export async function getOwnedServices(network: NetworkId, id: string, limit: number, offset: number) {
  const d = await gqlFetch<{
    services: {
      totalCount: number;
      nodes: {
        id: string;
        name: string | null;
        computeUnitsPerRelay: string | number | null;
      }[];
    };
    counts: { serviceId: string; suppliers: string | null; applications: string | null }[] | null;
  }>(network, SERVICE_OWNER_ROLE, { id, ids: [id], limit, offset, countLimit: OWNER_COUNT_LIMIT }, { revalidate: 60 });
  const counts = d.counts ?? [];
  const countBy = new Map(counts.map((c) => [c.serviceId, c]));
  // A service with no supplier config and no application has no summary row (0), unless the answer filled the rows
  // asked for: then a missing service is unknown. (Rows asked explicitly; a server limit below it would read as complete.)
  const complete = counts.length < OWNER_COUNT_LIMIT;
  const count = (sid: string, k: 'suppliers' | 'applications') => {
    const c = countBy.get(sid);
    return c ? Number(c[k] ?? 0) : complete ? 0 : null;
  };
  return {
    totalCount: d.services?.totalCount ?? 0,
    nodes: (d.services?.nodes ?? []).map((s) => ({
      id: s.id,
      name: s.name,
      computeUnitsPerRelay: s.computeUnitsPerRelay,
      supplierCount: count(s.id, 'suppliers'),
      appCount: count(s.id, 'applications'),
    })),
  };
}

// ---- rev-share income (reverse lookup) ----
export interface RevShareIncome extends Coverage {
  totalUpokt: string;
  transfers: number;
  /** Split by settlement family, as the settlement op reason that pays it. */
  byReason: { reason: string; amountUpokt: string; transfers: number }[];
}

/** The two settlement families that pay a rev-share recipient, as the income catalog names them. Order is display order. */
const INCOME_PARTS = [
  { family: 'relay', reason: 'TLM_RELAY_BURN_EQUALS_MINT_SUPPLIER_SHAREHOLDER_RD' },
  { family: 'global', reason: 'TLM_GLOBAL_MINT_SUPPLIER_SHAREHOLDER_REWARD_DISTRIBUTION' },
] as const;

/**
 * Lifetime rev-share income for a recipient, across every supplier that pays it: the income catalog's
 * `rev_share` rows (the address's income in other roles is not rev-share), per settlement family.
 *
 * Deliberately NOT scoped to the current page's suppliers, so the cache key stays stable across
 * pagination and paging through results does not recompute the figure every time.
 *
 * Cached longer than the page's other calls: a lifetime cumulative does not meaningfully change in
 * 60 seconds.
 */
export async function getRevShareIncome(network: NetworkId, recipient: string): Promise<RevShareIncome> {
  const d = await gqlFetch<{ getIncomeJson: unknown }>(network, REVSHARE_INCOME_AMOUNTS, { recipients: [recipient] }, { revalidate: 300 });
  const { data, range } = unwrapRange<{ role: string; family: string; amount_upokt: string | null; transfer_count: string | null }[]>(d.getIncomeJson);
  const rows = (data ?? []).filter((r) => r.role === 'rev_share');

  let total = BigInt(0);
  let transfers = 0;
  const byReason: RevShareIncome['byReason'] = [];
  for (const { family, reason } of INCOME_PARTS) {
    const part = rows.filter((r) => r.family === family);
    const amountUpokt = sumAmount(part, (r) => r.amount_upokt);
    const n = part.reduce((t, r) => t + Number(r.transfer_count ?? 0), 0);
    total += toBigInt(amountUpokt);
    transfers += n;
    if (n > 0) byReason.push({ reason, amountUpokt, transfers: n });
  }
  return { totalUpokt: total.toString(), transfers, byReason, ...coverage(range) };
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
