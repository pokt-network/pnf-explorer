import { NetLink as Link } from '@/components/shell/NetLink';
import { Tabs } from '@/components/ui/Tabs';
import type { TabDef } from '@/components/ui/Tabs';
import { Pager } from '@/components/ui/Pager';
import { EmptyState } from '@/components/ui/states';
import { RoleSplit, SummaryCard, DOT } from './RoleStats';
import { getOwnedServices } from '@/lib/data/roles';
import type { NetworkId } from '@/lib/networks';
import { formatNumber } from '@/lib/format';
import { parsePage } from '@/lib/paging';

const LIMIT = 25;

async function OwnedServicesPanel({ network, address, page }: { network: NetworkId; address: string; page: number }) {
  let data: Awaited<ReturnType<typeof getOwnedServices>>;
  try {
    data = await getOwnedServices(network, address, LIMIT, (page - 1) * LIMIT);
  } catch {
    return (
      <div className="card flush-top">
        <EmptyState>Couldn’t load owned services right now.</EmptyState>
      </div>
    );
  }
  if (data.nodes.length === 0) {
    return (
      <div className="card flush-top">
        <EmptyState>This address owns no service definitions.</EmptyState>
      </div>
    );
  }

  return (
    <div className="card flush-top">
      <div className="tbl-scroll">
        <table className="tbl">
          <thead>
            <tr>
              <th>Service</th>
              <th>Name</th>
              <th className="num">Compute units / relay</th>
              <th className="num">Suppliers</th>
              <th className="num">Applications</th>
            </tr>
          </thead>
          <tbody>
            {data.nodes.map((s) => (
              <tr key={s.id}>
                <td>
                  <Link href={`/service/${s.id}`} className="mono">
                    {s.id}
                  </Link>
                </td>
                <td>{s.name ?? <span className="dim">—</span>}</td>
                <td className="num mono">{formatNumber(s.computeUnitsPerRelay)}</td>
                <td className="num mono">
                  {s.supplierCount === 0 ? <span className="dim">0</span> : formatNumber(s.supplierCount)}
                </td>
                <td className="num mono">{s.appCount === 0 ? <span className="dim">0</span> : formatNumber(s.appCount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data.totalCount > LIMIT ? <Pager page={page} pageSize={LIMIT} totalCount={data.totalCount} param="svcs" /> : null}
    </div>
  );
}

/** The service-owner actor: an address that owns Service definitions on the network. */
export function ServiceOwnerRoleView({
  network,
  address,
  serviceCount,
  svcsPage,
}: {
  network: NetworkId;
  address: string;
  serviceCount: number;
  svcsPage: string | undefined;
}) {
  const tabs: TabDef[] = [
    { key: 'svcs', label: 'Owned Services', badge: serviceCount || undefined, panel: <OwnedServicesPanel network={network} address={address} page={parsePage(svcsPage)} /> },
  ];

  return (
    <>
      <RoleSplit>
        <SummaryCard label="Services Owned" dot={DOT.mint} value={formatNumber(serviceCount)} />
        <div className="kv" style={{ paddingTop: 0 }}>
          <div className="ttl">Service Owner</div>
          <div className="line">
            <div className="k">Owns</div>
            <div className="v">
              <b>{formatNumber(serviceCount)}</b> service definition{serviceCount === 1 ? '' : 's'}
              <div className="muted" style={{ marginTop: 4 }}>
                A service owner defines the service id, its name and its compute-units-per-relay rate. Suppliers stake to serve
                it; applications stake to consume it.
              </div>
            </div>
          </div>
        </div>
      </RoleSplit>

      <Tabs tabs={tabs} />
    </>
  );
}
