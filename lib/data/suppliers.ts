import { gqlFetch } from '@/lib/graphql';
import type { NetworkId } from '@/lib/networks';
import { SUPPLIERS_LIST } from '@/lib/queries/suppliers';

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
