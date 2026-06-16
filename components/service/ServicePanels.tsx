import { NetLink as Link } from '@/components/shell/NetLink';
import { Hash } from '@/components/ui/Hash';
import { EmptyState } from '@/components/ui/states';
import { getServiceSuppliers, getServiceApplications, getServiceDifficulty } from '@/lib/data/services';
import type { NetworkId } from '@/lib/networks';
import { formatPokt, formatNumber, truncate } from '@/lib/format';

const TAB_LIMIT = 25;

function MoreFooter({ shown, total, noun }: { shown: number; total: number; noun: string }) {
  if (total <= shown) return null;
  return (
    <div className="pager">
      <span>
        Showing first {shown} of {formatNumber(total)} {noun}
      </span>
    </div>
  );
}

function InlineError({ what }: { what: string }) {
  return (
    <div className="card flush-top">
      <EmptyState>Couldn’t load {what} right now.</EmptyState>
    </div>
  );
}

/** Active (Staked) suppliers serving the service — supplier address links to its account page. */
export async function ServiceSuppliersPanel({ network, id }: { network: NetworkId; id: string }) {
  let data: Awaited<ReturnType<typeof getServiceSuppliers>> | null = null;
  try {
    data = await getServiceSuppliers(network, id, TAB_LIMIT, 0);
  } catch {
    return <InlineError what="suppliers" />;
  }
  return (
    <div className="card flush-top">
      <div className="tbl-scroll">
        <table className="tbl">
          <thead>
            <tr>
              <th>Supplier</th>
              <th className="num">Stake</th>
              <th>Endpoint</th>
            </tr>
          </thead>
          <tbody>
            {data.nodes.map((s) => {
              const endpoint = s.endpoints?.[0]?.url ?? (s.domains?.length ? s.domains.join(', ') : null);
              return (
                <tr key={s.supplierId}>
                  <td className="mono">
                    <Hash value={s.supplierId} href={`/account/${s.supplierId}`} />
                  </td>
                  <td className="num mono">{s.supplier?.stakeAmount != null ? `${formatPokt(s.supplier.stakeAmount)} POKT` : '—'}</td>
                  <td className="mono dim" style={{ overflowWrap: 'anywhere' }}>{endpoint ?? '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {data.nodes.length === 0 ? <EmptyState>No active suppliers for this service.</EmptyState> : null}
      <MoreFooter shown={TAB_LIMIT} total={data.totalCount} noun="active suppliers" />
    </div>
  );
}

/** Active (Staked) applications staked for the service — address links to its account page. */
export async function ServiceApplicationsPanel({ network, id }: { network: NetworkId; id: string }) {
  let data: Awaited<ReturnType<typeof getServiceApplications>> | null = null;
  try {
    data = await getServiceApplications(network, id, TAB_LIMIT, 0);
  } catch {
    return <InlineError what="applications" />;
  }
  return (
    <div className="card flush-top">
      <div className="tbl-scroll">
        <table className="tbl">
          <thead>
            <tr>
              <th>Application</th>
              <th className="num">Stake</th>
            </tr>
          </thead>
          <tbody>
            {data.nodes.map((a) => (
              <tr key={a.applicationId}>
                <td className="mono">
                  <Hash value={a.applicationId} href={`/account/${a.applicationId}`} />
                </td>
                <td className="num mono">{a.application?.stakeAmount != null ? `${formatPokt(a.application.stakeAmount)} POKT` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data.nodes.length === 0 ? <EmptyState>No active applications for this service.</EmptyState> : null}
      <MoreFooter shown={TAB_LIMIT} total={data.totalCount} noun="active applications" />
    </div>
  );
}

/** Relay-mining difficulty / EMA update history (newest first). */
export async function ServiceDifficultyPanel({ network, id }: { network: NetworkId; id: string }) {
  let data: Awaited<ReturnType<typeof getServiceDifficulty>> | null = null;
  try {
    data = await getServiceDifficulty(network, id, TAB_LIMIT, 0);
  } catch {
    return <InlineError what="relay mining history" />;
  }
  return (
    <div className="card flush-top">
      <div className="tbl-scroll">
        <table className="tbl">
          <thead>
            <tr>
              <th>Block</th>
              <th className="num">Relays EMA</th>
              <th>Target Hash</th>
            </tr>
          </thead>
          <tbody>
            {data.nodes.map((d, i) => (
              <tr key={`${d.blockId}-${i}`}>
                <td className="mono">
                  <Link href={`/block/${d.blockId}`}>{formatNumber(d.blockId)}</Link>
                </td>
                <td className="num mono">{d.newNumRelaysEma != null ? formatNumber(d.newNumRelaysEma) : '—'}</td>
                <td className="mono dim">{d.newTargetHashHexEncoded ? truncate(d.newTargetHashHexEncoded, 10, 8) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data.nodes.length === 0 ? <EmptyState>No relay-mining difficulty updates recorded.</EmptyState> : null}
      <MoreFooter shown={TAB_LIMIT} total={data.totalCount} noun="updates" />
    </div>
  );
}
