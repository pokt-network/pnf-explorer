import { gqlFetch } from '@/lib/graphql';
import type { NetworkId } from '@/lib/networks';
import { SERVED_APP_GATEWAYS, SUPPLIERS_LIST, SUPPLIER_ROUTING } from '@/lib/queries/suppliers';
import { firstPerId, lifetimeCoverage, unwrapRange, type Coverage } from '@/lib/data/range';
import { METADATA_QUERY } from '@/lib/queries/shared';
import type { MetadataResult } from '@/lib/types';

export interface SupplierRow {
  id: string;
  ownerId: string | null;
  stakeAmount: string | null;
  stakeStatus: string | null;
  serviceConfigs: { totalCount: number };
}

/** Active (Staked) suppliers, ordered by stake desc (then id). Offset-paginated. ISR 30s. */
export async function getSupplierList(network: NetworkId, limit: number, offset: number) {
  const data = await gqlFetch<{
    getSupplierFleetList: { supplierId: string; ownerId: string | null; stakeUpokt: string | null; stakeStatus: string | null; serviceCount: string | null }[] | null;
    suppliers: { totalCount: number };
  }>(network, SUPPLIERS_LIST, { limit, offset }, { revalidate: 30 });
  return {
    totalCount: data.suppliers.totalCount,
    nodes: firstPerId(data.getSupplierFleetList ?? [], (s) => s.supplierId).map(
      (s): SupplierRow => ({
        id: s.supplierId,
        ownerId: s.ownerId,
        stakeAmount: s.stakeUpokt,
        stakeStatus: s.stakeStatus,
        serviceConfigs: { totalCount: Number(s.serviceCount ?? 0) },
      }),
    ),
  };
}

// ---- traffic / routing (which gateway sends a supplier its traffic, per service) ----
/** Per-service settled-traffic summary for a supplier, with the gateway(s) routing it. */
export interface ServiceTraffic {
  serviceId: string;
  relays: number;
  /** What the claims asked for, what was paid, and the difference lost to overservicing (upokt). */
  claimedUpokt: string;
  settledUpokt: string;
  overservicedUpokt: string;
  /** The latest settled height over the service's rows; null while the catalog cannot vouch for one. */
  lastBlock: number | null;
  /** Distinct gateways whose delegated apps drove this service's claims (the routing inference). */
  gateways: string[];
}
export interface SupplierRouting {
  byService: Record<string, ServiceTraffic>;
  /** # of services with ≥1 settled claim. */
  activeCount: number;
  /** All distinct routing gateways across every service. */
  gateways: string[];
  /** What the settlement catalog covers: a service missing past it is not covered yet, not idle. */
  coverage: Coverage;
  /** True when the gateway lookup failed: relays and status stand, the routing gateways are unknown. */
  gatewaysUnavailable: boolean;
}

/** Rows asked per page of the gateway lookup, ids per request, and the most pages one walk may read. */
const GATEWAY_PAGE = 1000;
const APP_CHUNK = 500;
const GATEWAY_PAGE_CAP = 50;
const GATEWAY_CHUNKS_AT_ONCE = 4;

/**
 * The gateways each application delegates to now. One consistent read: every page pinned to the same indexed
 * height (lastProcessedHeight advances only after a block commits whole, so rows of a block still being
 * written are not visible at it; one request alone is not a snapshot), by keyset (id order), stepping by the
 * rows returned. A walk that hits its page cap or ends
 * with fewer rows than the first page counted throws instead of returning a partial map.
 */
async function getAppGateways(network: NetworkId, appIds: string[], pinHeight: number | null): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  if (appIds.length === 0) return out;
  // A page at a fixed height never changes, so each one can stay cached. The height is the caller's (the page already
  // read the indexer's metadata), or read here when it has none.
  const blockHeight = String(
    pinHeight ?? (await gqlFetch<MetadataResult>(network, METADATA_QUERY, undefined, { revalidate: 30 }))._metadata.lastProcessedHeight,
  );
  // One walk per chunk of ids, at most GATEWAY_CHUNKS_AT_ONCE at a time; each walk is keyset by id.
  const walk = async (ids: string[]) => {
    let after = '';
    let seen = 0;
    let total: number | null = null;
    for (let page = 0; total == null || seen < total; page++) {
      if (page >= GATEWAY_PAGE_CAP) throw new Error(`Gateway lookup stopped at ${seen} rows (page cap ${GATEWAY_PAGE_CAP})`);
      const d = await gqlFetch<{ applicationGateways: { totalCount: number; nodes: { id: string; applicationId: string; gatewayId: string }[] } }>(
        network,
        SERVED_APP_GATEWAYS,
        { ids, blockHeight, after, limit: GATEWAY_PAGE },
        { revalidate: 30 },
      );
      const rows = d.applicationGateways.nodes;
      total ??= d.applicationGateways.totalCount;
      if (rows.length === 0) break;
      for (const n of rows) out.set(n.applicationId, [...(out.get(n.applicationId) ?? []), n.gatewayId]);
      seen += rows.length;
      after = rows[rows.length - 1].id;
    }
    if (seen !== total) throw new Error(`Gateway lookup read ${seen} of ${total} rows`);
  };
  const chunks: string[][] = [];
  for (let i = 0; i < appIds.length; i += APP_CHUNK) chunks.push(appIds.slice(i, i + APP_CHUNK));
  for (let i = 0; i < chunks.length; i += GATEWAY_CHUNKS_AT_ONCE) await Promise.all(chunks.slice(i, i + GATEWAY_CHUNKS_AT_ONCE).map(walk));
  return out;
}

/**
 * Reconstruct a supplier's actual traffic and its routing gateway(s), per service. The signing
 * gateway isn't recorded on-chain, so this joins settled claims (service+app+relays+block) to each
 * app's delegated gateways — an authorized-routing inference, not cryptographic proof. Empty for an
 * idle supplier (no settled claims). See SUPPLIER_ROUTING. The settlement catalog answers what it
 * covers; `lastBlock` is null where it cannot vouch for a height yet.
 */
export async function getSupplierRouting(network: NetworkId, id: string, pinHeight: number | null = null): Promise<SupplierRouting> {
  const data = await gqlFetch<{ getSupplierEarningsJson: unknown }>(network, SUPPLIER_ROUTING, { suppliers: [id] }, { revalidate: 30 });
  const answer = unwrapRange<
    {
      service_id: string;
      application_id: string;
      relays: string | null;
      claimed_upokt: string | null;
      settled_upokt: string | null;
      overservicing_loss_upokt: string | null;
      last_settled_height: string | null;
    }[]
  >(data.getSupplierEarningsJson);
  const rows = answer.data ?? [];
  // A failed gateway lookup costs the routing column, not the tab.
  const appGateways = await getAppGateways(network, [...new Set(rows.map((r) => r.application_id).filter(Boolean))], pinHeight).catch(() => null);

  // Per service: the (service, application) rows summed. Amounts are JSON strings (they can pass 2^53): BigInt.
  const byService: Record<string, ServiceTraffic> = {};
  const unknownLast = new Set<string>();
  const add = (a: string, b: string | null) => (BigInt(a) + BigInt(b ?? '0')).toString();
  for (const r of rows) {
    const serviceId = r.service_id;
    if (!serviceId) continue;
    const entry = (byService[serviceId] ??= { serviceId, relays: 0, claimedUpokt: '0', settledUpokt: '0', overservicedUpokt: '0', lastBlock: null, gateways: [] });
    entry.relays += Number(r.relays ?? 0);
    entry.claimedUpokt = add(entry.claimedUpokt, r.claimed_upokt);
    entry.settledUpokt = add(entry.settledUpokt, r.settled_upokt);
    entry.overservicedUpokt = add(entry.overservicedUpokt, r.overservicing_loss_upokt);
    // One row the catalog cannot vouch for makes the service's latest height unknown, not the max of the others.
    if (r.last_settled_height == null) unknownLast.add(serviceId);
    else entry.lastBlock = Math.max(entry.lastBlock ?? 0, Number(r.last_settled_height));
    for (const gw of appGateways?.get(r.application_id) ?? []) {
      if (!entry.gateways.includes(gw)) entry.gateways.push(gw);
    }
  }

  for (const serviceId of unknownLast) byService[serviceId].lastBlock = null;
  const gateways = [...new Set(Object.values(byService).flatMap((e) => e.gateways))];
  return { byService, activeCount: Object.keys(byService).length, gateways, coverage: lifetimeCoverage(answer.range), gatewaysUnavailable: appGateways == null };
}
