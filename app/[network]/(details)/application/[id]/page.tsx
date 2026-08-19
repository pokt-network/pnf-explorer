import { redirectToRole } from '@/lib/role-alias';
import type { NetworkId } from '@/lib/networks';

// Alias route: /application/{addr} → /account/{addr}?as=application. See lib/role-alias.ts.
export default async function ApplicationAliasPage({ params }: { params: Promise<{ network: NetworkId; id: string }> }) {
  const { network, id } = await params;
  redirectToRole(network, id, 'application');
}
