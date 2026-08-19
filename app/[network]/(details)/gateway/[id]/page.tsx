import { redirectToRole } from '@/lib/role-alias';
import type { NetworkId } from '@/lib/networks';

// Alias route: /gateway/{addr} → /account/{addr}?as=gateway. See lib/role-alias.ts.
export default async function GatewayAliasPage({ params }: { params: Promise<{ network: NetworkId; id: string }> }) {
  const { network, id } = await params;
  redirectToRole(network, id, 'gateway');
}
