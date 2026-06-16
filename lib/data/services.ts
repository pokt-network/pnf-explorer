import { gqlFetch } from '@/lib/graphql';
import type { NetworkId } from '@/lib/networks';
import { SERVICES_LIST, SERVICE_BY_ID, SERVICE_SUPPLIERS, SERVICE_APPLICATIONS, SERVICE_DIFFICULTY } from '@/lib/queries/services';

// Services are infrequently updated and stable for long stretches, so the list + its per-service
// active-supplier counts use a long (12h) ISR window — adequate for a top-level overview.
const SERVICES_TTL = 12 * 60 * 60;

// Services data layer (indexer-only; no LCD). "Active" counts/lists filter to currently-Staked
// suppliers/apps — see lib/queries/services.ts for why a filtered totalCount is the distinct count.

export interface ServiceDifficultyPoint {
  blockId: string;
  prevNumRelaysEma?: string | null;
  newNumRelaysEma: string | null;
  newTargetHashHexEncoded: string | null;
}

export interface ServiceDetail {
  id: string;
  name: string | null;
  computeUnitsPerRelay: string | null;
  ownerId: string | null;
  owner: { id: string } | null;
  latestDiff: { nodes: ServiceDifficultyPoint[] };
}

export interface ServiceSummary {
  service: ServiceDetail;
  activeSuppliers: number | null;
  totalSuppliers: number | null;
  activeApps: number | null;
}

export interface ServiceListRow {
  id: string;
  name: string | null;
  computeUnitsPerRelay: string | null;
  ownerId: string | null;
}

export interface ServiceListRowWithCount extends ServiceListRow {
  activeSuppliers: number;
}

// The indexer caps connection page size at 100.
const PAGE_CAP = 100;

/** One page of services (ordered by name). 12h ISR — services rarely change. */
export async function getServiceList(network: NetworkId, limit: number, offset: number) {
  const data = await gqlFetch<{ services: { totalCount: number; nodes: ServiceListRow[] } }>(
    network,
    SERVICES_LIST,
    { limit: Math.min(limit, PAGE_CAP), offset },
    { revalidate: SERVICES_TTL },
  );
  return data.services;
}

/**
 * Active (Staked) supplier count per service id. Built as aliased+parameterized batches
 * (cN: …, $idN), chunked to the 100-field cap. 12h ISR — these move slowly and per-service
 * counts would otherwise be hundreds of separate calls. Map keyed by id; missing ids → 0.
 */
export async function getServiceActiveSupplierCounts(network: NetworkId, ids: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  for (let start = 0; start < ids.length; start += PAGE_CAP) {
    const chunk = ids.slice(start, start + PAGE_CAP);
    const varDefs = chunk.map((_, i) => `$id${i}: String!`).join(', ');
    const fields = chunk
      .map((_, i) => `c${i}: supplierServiceConfigs(filter:{serviceId:{equalTo:$id${i}},supplier:{stakeStatus:{equalTo:Staked}}}){totalCount}`)
      .join('\n');
    const query = `query serviceSupplierCounts(${varDefs}) {\n${fields}\n}`;
    const vars: Record<string, string> = {};
    chunk.forEach((id, i) => (vars[`id${i}`] = id));
    try {
      const data = await gqlFetch<Record<string, { totalCount: number } | null>>(network, query, vars, { revalidate: SERVICES_TTL });
      chunk.forEach((id, i) => map.set(id, data[`c${i}`]?.totalCount ?? 0));
    } catch {
      /* leave this chunk's counts unset → those rows render 0 */
    }
  }
  return map;
}

/**
 * Every service (paged through the 100-row cap) with its active-supplier count. 12h ISR. Used by
 * the services list so it can sort by CU/relay OR active suppliers across the FULL set, then
 * paginate in memory (the supplier count is computed, not an orderable indexer field).
 */
export async function getAllServicesWithCounts(network: NetworkId): Promise<ServiceListRowWithCount[]> {
  const all: ServiceListRow[] = [];
  for (let i = 0; i < 20; i++) {
    const { nodes, totalCount } = await getServiceList(network, PAGE_CAP, all.length);
    all.push(...nodes);
    if (nodes.length === 0 || all.length >= totalCount) break;
  }
  const counts = await getServiceActiveSupplierCounts(network, all.map((n) => n.id));
  return all.map((n) => ({ ...n, activeSuppliers: counts.get(n.id) ?? 0 }));
}

/** Service header + active supplier/app counts + latest relay-mining difficulty. null → notFound. */
export async function getService(network: NetworkId, id: string): Promise<ServiceSummary | null> {
  const data = await gqlFetch<{
    service: ServiceDetail | null;
    activeSuppliers: { totalCount: number } | null;
    totalSuppliers: { totalCount: number } | null;
    activeApps: { totalCount: number } | null;
  }>(network, SERVICE_BY_ID, { id }, { revalidate: 60 });
  if (!data.service) return null;
  return {
    service: data.service,
    activeSuppliers: data.activeSuppliers?.totalCount ?? null,
    totalSuppliers: data.totalSuppliers?.totalCount ?? null,
    activeApps: data.activeApps?.totalCount ?? null,
  };
}

export interface ServiceEndpoint {
  url?: string;
  rpcType?: number;
}
export interface ServiceSupplierRow {
  supplierId: string;
  domains: string[] | null;
  endpoints: ServiceEndpoint[] | null;
  supplier: { stakeAmount: string | null; stakeStatus: string | null } | null;
}

/** Active (Staked) suppliers serving this service. */
export async function getServiceSuppliers(network: NetworkId, id: string, limit: number, offset: number) {
  const data = await gqlFetch<{ supplierServiceConfigs: { totalCount: number; nodes: ServiceSupplierRow[] } }>(
    network,
    SERVICE_SUPPLIERS,
    { id, limit, offset },
    { revalidate: 60 },
  );
  return data.supplierServiceConfigs;
}

export interface ServiceApplicationRow {
  applicationId: string;
  application: { stakeAmount: string | null; stakeStatus: string | null } | null;
}

/** Active (Staked) applications staked for this service. */
export async function getServiceApplications(network: NetworkId, id: string, limit: number, offset: number) {
  const data = await gqlFetch<{ applicationServices: { totalCount: number; nodes: ServiceApplicationRow[] } }>(
    network,
    SERVICE_APPLICATIONS,
    { id, limit, offset },
    { revalidate: 60 },
  );
  return data.applicationServices;
}

/** Relay-mining difficulty / EMA update history for this service (newest first). */
export async function getServiceDifficulty(network: NetworkId, id: string, limit: number, offset: number) {
  const data = await gqlFetch<{
    service: { relayMiningDifficultyUpdatedEvents: { totalCount: number; nodes: ServiceDifficultyPoint[] } } | null;
  }>(network, SERVICE_DIFFICULTY, { id, limit, offset }, { revalidate: 60 });
  return data.service?.relayMiningDifficultyUpdatedEvents ?? { totalCount: 0, nodes: [] };
}
