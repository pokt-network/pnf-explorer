import { gqlFetch } from '@/lib/graphql';
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

/** Paginated service list (ordered by name). 12h ISR — services rarely change. */
export async function getServiceList(limit: number, offset: number) {
  const data = await gqlFetch<{ services: { totalCount: number; nodes: ServiceListRow[] } }>(
    SERVICES_LIST,
    { limit, offset },
    { revalidate: SERVICES_TTL },
  );
  return data.services;
}

/**
 * Active (Staked) supplier count per service id, in ONE aliased+parameterized query (cN: …, $idN).
 * 12h ISR — these counts move slowly and 173 per-service counts would be too many separate calls.
 * Returns a Map keyed by service id; missing ids default to 0.
 */
export async function getServiceActiveSupplierCounts(ids: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (ids.length === 0) return map;
  const varDefs = ids.map((_, i) => `$id${i}: String!`).join(', ');
  const fields = ids
    .map((_, i) => `c${i}: supplierServiceConfigs(filter:{serviceId:{equalTo:$id${i}},supplier:{stakeStatus:{equalTo:Staked}}}){totalCount}`)
    .join('\n');
  const query = `query serviceSupplierCounts(${varDefs}) {\n${fields}\n}`;
  const vars: Record<string, string> = {};
  ids.forEach((id, i) => (vars[`id${i}`] = id));
  try {
    const data = await gqlFetch<Record<string, { totalCount: number } | null>>(query, vars, { revalidate: SERVICES_TTL });
    ids.forEach((id, i) => map.set(id, data[`c${i}`]?.totalCount ?? 0));
  } catch {
    /* leave counts unset → page renders "—" */
  }
  return map;
}

/** Service header + active supplier/app counts + latest relay-mining difficulty. null → notFound. */
export async function getService(id: string): Promise<ServiceSummary | null> {
  const data = await gqlFetch<{
    service: ServiceDetail | null;
    activeSuppliers: { totalCount: number } | null;
    totalSuppliers: { totalCount: number } | null;
    activeApps: { totalCount: number } | null;
  }>(SERVICE_BY_ID, { id }, { revalidate: 60 });
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
export async function getServiceSuppliers(id: string, limit: number, offset: number) {
  const data = await gqlFetch<{ supplierServiceConfigs: { totalCount: number; nodes: ServiceSupplierRow[] } }>(
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
export async function getServiceApplications(id: string, limit: number, offset: number) {
  const data = await gqlFetch<{ applicationServices: { totalCount: number; nodes: ServiceApplicationRow[] } }>(
    SERVICE_APPLICATIONS,
    { id, limit, offset },
    { revalidate: 60 },
  );
  return data.applicationServices;
}

/** Relay-mining difficulty / EMA update history for this service (newest first). */
export async function getServiceDifficulty(id: string, limit: number, offset: number) {
  const data = await gqlFetch<{
    service: { relayMiningDifficultyUpdatedEvents: { totalCount: number; nodes: ServiceDifficultyPoint[] } } | null;
  }>(SERVICE_DIFFICULTY, { id, limit, offset }, { revalidate: 60 });
  return data.service?.relayMiningDifficultyUpdatedEvents ?? { totalCount: 0, nodes: [] };
}
