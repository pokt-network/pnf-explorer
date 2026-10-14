import { gqlFetch } from '@/lib/graphql';
import type { NetworkId } from '@/lib/networks';
import { SERVED_APP_GATEWAYS, SUPPLIERS_LIST, SUPPLIER_ROUTING, SUPPLIER_SERVICE_COUNTS } from '@/lib/queries/suppliers';
import { unwrapRange } from '@/lib/data/range';

export interface SupplierRow {
  id: string;
  ownerId: string | null;
  stakeAmount: string | null;
  stakeStatus: string | null;
  serviceConfigs: { totalCount: number };
}

/** The # of services each supplier listed (up to 200) has a live config for; an id the function does not return counts 0. */
export async function getSupplierServiceCounts(network: NetworkId, ids: string[], revalidate = 30): Promise<Map<string, number>> {
  if (ids.length === 0) return new Map();
  const data = await gqlFetch<{ getSupplierFleetList: { supplierId: string; serviceCount: string | null }[] | null }>(
    network,
    SUPPLIER_SERVICE_COUNTS,
    { ids },
    { revalidate },
  );
  return new Map((data.getSupplierFleetList ?? []).map((r) => [r.supplierId, Number(r.serviceCount ?? 0)]));
}

/** Active (Staked) suppliers, ordered by stake desc. Offset-paginated. ISR 30s. */
export async function getSupplierList(network: NetworkId, limit: number, offset: number) {
  const data = await gqlFetch<{ suppliers: { totalCount: number; nodes: Omit<SupplierRow, 'serviceConfigs'>[] } }>(
    network,
    SUPPLIERS_LIST,
    { limit, offset },
    { revalidate: 30 },
  );
  const counts = await getSupplierServiceCounts(network, data.suppliers.nodes.map((n) => n.id));
  return {
    totalCount: data.suppliers.totalCount,
    nodes: data.suppliers.nodes.map((n): SupplierRow => ({ ...n, serviceConfigs: { totalCount: counts.get(n.id) ?? 0 } })),
  };
}

// ---- traffic / routing (which gateway sends a supplier its traffic, per service) ----
/** Per-service settled-traffic summary for a supplier, with the gateway(s) routing it. */
export interface ServiceTraffic {
  serviceId: string;
  relays: number;
  lastBlock: number;
  /** Distinct gateways whose delegated apps drove this service's claims (the routing inference). */
  gateways: string[];
}
export interface SupplierRouting {
  byService: Record<string, ServiceTraffic>;
  /** # of services with ≥1 settled claim. */
  activeCount: number;
  /** All distinct routing gateways across every service. */
  gateways: string[];
}

/** Page size of the gateway lookup (the indexer's connection limit), and ids per request. */
const GATEWAY_PAGE = 1000;
const APP_CHUNK = 500;

/** The gateways each application delegates to now. */
async function getAppGateways(network: NetworkId, appIds: string[]): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  for (let i = 0; i < appIds.length; i += APP_CHUNK) {
    const ids = appIds.slice(i, i + APP_CHUNK);
    for (let offset = 0; ; offset += GATEWAY_PAGE) {
      const d = await gqlFetch<{ applicationGateways: { nodes: { applicationId: string; gatewayId: string }[] } }>(
        network,
        SERVED_APP_GATEWAYS,
        { ids, limit: GATEWAY_PAGE, offset },
        { revalidate: 30 },
      );
      for (const n of d.applicationGateways.nodes) out.set(n.applicationId, [...(out.get(n.applicationId) ?? []), n.gatewayId]);
      if (d.applicationGateways.nodes.length < GATEWAY_PAGE) break;
    }
  }
  return out;
}

/**
 * Reconstruct a supplier's actual traffic and its routing gateway(s), per service. The signing
 * gateway isn't recorded on-chain, so this joins settled claims (service+app+relays+block) to each
 * app's delegated gateways — an authorized-routing inference, not cryptographic proof. Empty for an
 * idle supplier (no settled claims). See SUPPLIER_ROUTING. The settlement catalog answers what it
 * covers; `lastBlock` is 0 where it cannot vouch for a height yet.
 */
export async function getSupplierRouting(network: NetworkId, id: string): Promise<SupplierRouting> {
  const data = await gqlFetch<{ getSupplierEarningsJson: unknown }>(network, SUPPLIER_ROUTING, { suppliers: [id] }, { revalidate: 30 });
  const rows =
    unwrapRange<{ service_id: string; application_id: string; relays: string | null; last_settled_height: string | null }[]>(data.getSupplierEarningsJson)
      .data ?? [];
  const appGateways = await getAppGateways(network, [...new Set(rows.map((r) => r.application_id).filter(Boolean))]);

  const byService: Record<string, ServiceTraffic> = {};
  for (const r of rows) {
    const serviceId = r.service_id;
    if (!serviceId) continue;
    const entry = (byService[serviceId] ??= { serviceId, relays: 0, lastBlock: 0, gateways: [] });
    entry.relays += Number(r.relays ?? 0);
    entry.lastBlock = Math.max(entry.lastBlock, Number(r.last_settled_height ?? 0));
    for (const gw of appGateways.get(r.application_id) ?? []) {
      if (!entry.gateways.includes(gw)) entry.gateways.push(gw);
    }
  }

  const gateways = [...new Set(Object.values(byService).flatMap((e) => e.gateways))];
  return { byService, activeCount: Object.keys(byService).length, gateways };
}
