import { gqlFetch } from '@/lib/graphql';
import type { NetworkId } from '@/lib/networks';
import { APPLICATIONS_LIST } from '@/lib/queries/applications';

export interface ApplicationRow {
  id: string;
  stakeAmount: string | null;
  stakeStatus: string | null;
  applicationServices: { totalCount: number };
}

/** Active (Staked) applications ordered by stake desc (then id). Offset-paginated. ISR 30s. */
export async function getApplicationList(network: NetworkId, limit: number, offset: number) {
  const data = await gqlFetch<{
    getApplicationFleetList: { applicationId: string; stakeUpokt: string | null; stakeStatus: string | null; serviceCount: string | null }[] | null;
    applications: { totalCount: number };
  }>(network, APPLICATIONS_LIST, { limit, offset }, { revalidate: 30 });
  return {
    totalCount: data.applications.totalCount,
    nodes: (data.getApplicationFleetList ?? []).map(
      (a): ApplicationRow => ({
        id: a.applicationId,
        stakeAmount: a.stakeUpokt,
        stakeStatus: a.stakeStatus,
        applicationServices: { totalCount: Number(a.serviceCount ?? 0) },
      }),
    ),
  };
}
