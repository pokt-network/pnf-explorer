import { gqlFetch } from '@/lib/graphql';
import type { NetworkId } from '@/lib/networks';
import { SUPPLIERS_LIST, SUPPLIER_ROUTING } from '@/lib/queries/suppliers';

export interface SupplierRow {
  id: string;
  ownerId: string | null;
  stakeAmount: string | null;
  stakeStatus: string | null;
  serviceConfigs: { totalCount: number };
}

/** Active (Staked) suppliers, ordered by stake desc. Offset-paginated. ISR 30s. */
export async function getSupplierList(network: NetworkId, limit: number, offset: number) {
  const data = await gqlFetch<{ suppliers: { totalCount: number; nodes: SupplierRow[] } }>(
    network,
    SUPPLIERS_LIST,
    { limit, offset },
    { revalidate: 30 },
  );
  return data.suppliers;
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

interface SupplierRoutingResult {
  supplier: {
    settled: {
      groupedAggregates: { keys: string[]; sum: { numRelays: string | null }; max: { blockId: string | null } }[] | null;
    };
    servedApps: { nodes: { id: string; applicationGateways: { nodes: { gatewayId: string }[] } }[] };
  } | null;
}

/**
 * Reconstruct a supplier's actual traffic and its routing gateway(s), per service. The signing
 * gateway isn't recorded on-chain, so this joins settled claims (service+app+relays+block) to each
 * app's delegated gateways — an authorized-routing inference, not cryptographic proof. Empty for an
 * idle supplier (no settled claims). See SUPPLIER_ROUTING.
 */
export async function getSupplierRouting(network: NetworkId, id: string): Promise<SupplierRouting> {
  const data = await gqlFetch<SupplierRoutingResult>(network, SUPPLIER_ROUTING, { id }, { revalidate: 30 });
  const s = data.supplier;
  if (!s) return { byService: {}, activeCount: 0, gateways: [] };

  const appGateways = new Map<string, string[]>();
  for (const app of s.servedApps.nodes) {
    appGateways.set(app.id, app.applicationGateways.nodes.map((g) => g.gatewayId));
  }

  const byService: Record<string, ServiceTraffic> = {};
  for (const g of s.settled.groupedAggregates ?? []) {
    const [serviceId, appId] = g.keys;
    if (!serviceId) continue;
    const entry = (byService[serviceId] ??= { serviceId, relays: 0, lastBlock: 0, gateways: [] });
    entry.relays += Number(g.sum.numRelays ?? 0);
    entry.lastBlock = Math.max(entry.lastBlock, Number(g.max.blockId ?? 0));
    for (const gw of appGateways.get(appId) ?? []) {
      if (!entry.gateways.includes(gw)) entry.gateways.push(gw);
    }
  }

  const gateways = [...new Set(Object.values(byService).flatMap((e) => e.gateways))];
  return { byService, activeCount: Object.keys(byService).length, gateways };
}
