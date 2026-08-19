import { redirectToRole } from '@/lib/role-alias';
import type { NetworkId } from '@/lib/networks';

// Alias route: /supplier/{addr} → /account/{addr}?as=supplier. See lib/role-alias.ts.
export default async function SupplierAliasPage({ params }: { params: Promise<{ network: NetworkId; id: string }> }) {
  const { network, id } = await params;
  redirectToRole(network, id, 'supplier');
}
