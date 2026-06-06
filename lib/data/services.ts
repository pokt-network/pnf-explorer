import { gqlFetch } from '@/lib/graphql';
import { SERVICE_BY_ID, SERVICE_SUPPLIERS, SERVICE_APPLICATIONS, SERVICE_DIFFICULTY } from '@/lib/queries/services';

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
