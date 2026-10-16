import { gqlFetch } from '@/lib/graphql';
import type { NetworkId } from '@/lib/networks';
import { SUPPLIERS_LIST, SUPPLIER_ROUTING } from '@/lib/queries/suppliers';
import { firstPerId, lifetimeCoverage, unwrapRange, type Coverage } from '@/lib/data/range';

export interface SupplierRow {
  id: string;
  ownerId: string | null;
  stakeAmount: string | null;
  stakeStatus: string | null;
  serviceConfigs: { totalCount: number };
}

/**
 * Rows [offset, offset + limit) of a fleet-function list in its order (stake desc, then id), in ONE request at any
 * depth: `rowLimit` and `rowOffset` make the function compute only that page. `read` returns the rows and whatever else
 * its document carries.
 */
export async function fleetPage<T, X>(
  read: (rowLimit: number, rowOffset: number) => Promise<{ rows: T[]; extra: X }>,
  limit: number,
  offset: number,
): Promise<{ rows: T[]; extra: X }> {
  return read(limit, offset);
}

type FleetRow = { supplierId: string; ownerId: string | null; stakeUpokt: string | null; stakeStatus: string | null; serviceCount: string | null };

/** Active (Staked) suppliers, ordered by stake desc (then id), one request per page (see fleetPage). ISR 30s. */
export async function getSupplierList(network: NetworkId, limit: number, offset: number) {
  const { rows, extra: totalCount } = await fleetPage<FleetRow, number>(
    (rowLimit, rowOffset) =>
      gqlFetch<{ getSupplierFleetList: FleetRow[] | null; suppliers: { totalCount: number } }>(
        network,
        SUPPLIERS_LIST,
        { rowLimit, rowOffset },
        { revalidate: 30 },
      ).then((d) => ({ rows: d.getSupplierFleetList ?? [], extra: d.suppliers.totalCount })),
    limit,
    offset,
  );
  return {
    totalCount,
    nodes: firstPerId(rows, (s) => s.supplierId).map(
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
}

/**
 * Reconstruct a supplier's actual traffic and its routing gateway(s), per service. The signing
 * gateway isn't recorded on-chain, so this joins settled claims (service+app+relays+block) to each
 * app's delegated gateways — an authorized-routing inference, not cryptographic proof. Empty for an
 * idle supplier (no settled claims). See SUPPLIER_ROUTING. The settlement catalog answers what it
 * covers; `lastBlock` is null where it cannot vouch for a height yet.
 */
export async function getSupplierRouting(network: NetworkId, id: string): Promise<SupplierRouting> {
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
      /** The application's gateways now. */
      gateway_ids: string[] | null;
    }[]
  >(data.getSupplierEarningsJson);
  const rows = answer.data ?? [];

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
    for (const gw of r.gateway_ids ?? []) {
      if (!entry.gateways.includes(gw)) entry.gateways.push(gw);
    }
  }

  for (const serviceId of unknownLast) byService[serviceId].lastBlock = null;
  const gateways = [...new Set(Object.values(byService).flatMap((e) => e.gateways))];
  return { byService, activeCount: Object.keys(byService).length, gateways, coverage: lifetimeCoverage(answer.range) };
}
