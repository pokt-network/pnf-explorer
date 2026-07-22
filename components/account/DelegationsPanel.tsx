import { Hash } from '@/components/ui/Hash';
import { Pager } from '@/components/ui/Pager';
import { EmptyState } from '@/components/ui/states';
import { getAppDelegatedGateways, getGatewayDelegatingApps } from '@/lib/data/accounts';
import type { NetworkId } from '@/lib/networks';

const LIMIT = 25;

/**
 * Gateway delegations, either direction:
 *   'app-gateways' — gateways this application delegates to (paged via `?gateways=`).
 *   'gateway-apps' — applications delegating to this gateway (can be many → paged via `?apps=`).
 */
export async function DelegationsPanel({ network, address, direction, page }: { network: NetworkId; address: string; direction: 'app-gateways' | 'gateway-apps'; page: number }) {
  const isApp = direction === 'app-gateways';
  const noun = isApp ? 'gateways' : 'applications';
  const param = isApp ? 'gateways' : 'apps';
  let total = 0;
  let rows: string[] = [];
  try {
    if (isApp) {
      const d = await getAppDelegatedGateways(network, address, LIMIT, (page - 1) * LIMIT);
      total = d.totalCount;
      rows = d.nodes.map((n) => n.gatewayId);
    } else {
      const d = await getGatewayDelegatingApps(network, address, LIMIT, (page - 1) * LIMIT);
      total = d.totalCount;
      rows = d.nodes.map((n) => n.applicationId);
    }
  } catch {
    return <div className="card flush-top"><EmptyState>Couldn’t load {noun} right now.</EmptyState></div>;
  }
  if (rows.length === 0 && page === 1) {
    return <div className="card flush-top"><EmptyState>No {noun} {isApp ? 'delegated' : 'delegating'}.</EmptyState></div>;
  }

  return (
    <div className="card flush-top">
      <div className="tbl-scroll">
        <table className="tbl">
          <thead>
            <tr>
              <th>{isApp ? 'Gateway' : 'Application'}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((addr) => (
              <tr key={addr}>
                <td>
                  <Hash value={addr} href={`/account/${addr}`} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {total > LIMIT ? <Pager page={page} pageSize={LIMIT} totalCount={total} param={param} /> : null}
    </div>
  );
}
