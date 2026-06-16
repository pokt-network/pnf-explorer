import { gqlFetch } from '@/lib/graphql';
import type { NetworkId } from '@/lib/networks';
import { APPLICATIONS_LIST } from '@/lib/queries/applications';

export interface ApplicationRow {
  id: string;
  stakeAmount: string | null;
  stakeStatus: string | null;
  applicationServices: { totalCount: number };
}

/** Active (Staked) applications ordered by stake desc. Offset-paginated. ISR 30s. */
export async function getApplicationList(network: NetworkId, limit: number, offset: number) {
  const data = await gqlFetch<{ applications: { totalCount: number; nodes: ApplicationRow[] } }>(
    network,
    APPLICATIONS_LIST,
    { limit, offset },
    { revalidate: 30 },
  );
  return data.applications;
}
