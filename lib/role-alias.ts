import { redirect } from 'next/navigation';
import { netHref, type NetworkId } from '@/lib/networks';
import type { RoleId } from '@/lib/roles';

/**
 * Actor-shaped URL aliases (ROLE-VIEWS-DESIGN.md §2). `/supplier/{addr}`, `/application/{addr}` and
 * `/gateway/{addr}` are the URLs people paste from other explorers; they land on the same address
 * page opened at that actor's role rather than 404ing or dropping the reader on the wallet view.
 *
 * `redirect()` needs the BROWSER-visible path, so route through `netHref` (mainnet is prefix-less,
 * every other network keeps its `/<id>` prefix).
 */
export function redirectToRole(network: NetworkId, id: string, role: RoleId): never {
  redirect(netHref(network, `/account/${encodeURIComponent(id)}?as=${role}`));
}
