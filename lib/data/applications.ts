import { gqlFetch } from '@/lib/graphql';
import type { NetworkId } from '@/lib/networks';
import { APPLICATIONS_LIST, APPLICATION_SERVICE_COUNTS } from '@/lib/queries/applications';

export interface ApplicationRow {
  id: string;
  stakeAmount: string | null;
  stakeStatus: string | null;
  applicationServices: { totalCount: number };
}

/** Active (Staked) applications ordered by stake desc. Offset-paginated. ISR 30s. */
export async function getApplicationList(network: NetworkId, limit: number, offset: number) {
  const data = await gqlFetch<{ applications: { totalCount: number; nodes: Omit<ApplicationRow, 'applicationServices'>[] } }>(
    network,
    APPLICATIONS_LIST,
    { limit, offset },
    { revalidate: 30 },
  );
  // The # of services per application, from the fleet function (an id it does not return counts 0).
  const ids = data.applications.nodes.map((n) => n.id);
  const counts =
    ids.length === 0
      ? []
      : ((await gqlFetch<{ getApplicationFleetList: { applicationId: string; serviceCount: string | null }[] | null }>(
          network,
          APPLICATION_SERVICE_COUNTS,
          { ids },
          { revalidate: 30 },
        )).getApplicationFleetList ?? []);
  const byId = new Map(counts.map((r) => [r.applicationId, Number(r.serviceCount ?? 0)]));
  return {
    totalCount: data.applications.totalCount,
    nodes: data.applications.nodes.map((n): ApplicationRow => ({ ...n, applicationServices: { totalCount: byId.get(n.id) ?? 0 } })),
  };
}
