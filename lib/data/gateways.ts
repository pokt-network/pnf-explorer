import { gqlFetch } from '@/lib/graphql';
import { GATEWAYS_LIST } from '@/lib/queries/gateways';

export interface GatewayRow {
  id: string;
  stakeAmount: string | null;
  stakeStatus: string | null;
}

/** Gateways ordered by stake desc (all statuses; status pill in the row). Offset-paginated. ISR 30s. */
export async function getGatewayList(limit: number, offset: number) {
  const data = await gqlFetch<{ gateways: { totalCount: number; nodes: GatewayRow[] } }>(
    GATEWAYS_LIST,
    { limit, offset },
    { revalidate: 30 },
  );
  return data.gateways;
}
