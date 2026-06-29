import { NetLink as Link } from '@/components/shell/NetLink';
import { Hash } from '@/components/ui/Hash';
import { EmptyState } from '@/components/ui/states';
import type { SupplierRole } from '@/lib/data/accounts';
import { rpcTypeLabel } from '@/lib/service';

/** Annotate a rev-share recipient with its role relative to this supplier. */
function shareTag(address: string, operatorId: string, ownerId: string): string | null {
  if (address === ownerId) return 'owner';
  if (address === operatorId) return 'operator';
  return null;
}

/**
 * Services tab for a supplier (operator). One row per staked service: the service it serves, its
 * endpoint(s) + RPC type, and the rev-share split (who earns what), with owner/operator annotated.
 */
export function SupplierServicesPanel({ supplier }: { supplier: SupplierRole }) {
  const configs = supplier.serviceConfigs.nodes;
  if (configs.length === 0) return <div className="card flush-top"><EmptyState>No service configs for this supplier.</EmptyState></div>;

  return (
    <div className="card flush-top">
      <div className="tbl-scroll">
        <table className="tbl">
          <thead>
            <tr>
              <th>Service</th>
              <th>Endpoint</th>
              <th>RPC</th>
              <th>Rev-share</th>
            </tr>
          </thead>
          <tbody>
            {configs.map((c) => (
              <tr key={c.serviceId}>
                <td>
                  <Link href={`/service/${c.serviceId}`} className="mono">{c.serviceId}</Link>
                </td>
                <td>
                  {c.endpoints.length === 0 ? (
                    <span className="dim">—</span>
                  ) : (
                    c.endpoints.map((e, i) => (
                      <div key={i} className="mono" style={{ fontSize: 12, wordBreak: 'break-all' }}>
                        {e.url}
                      </div>
                    ))
                  )}
                </td>
                <td>
                  {c.endpoints.length === 0 ? <span className="dim">—</span> : [...new Set(c.endpoints.map((e) => rpcTypeLabel(e.rpcType)))].join(', ')}
                </td>
                <td>
                  {c.revShare.length === 0 ? (
                    <span className="dim">—</span>
                  ) : (
                    c.revShare.map((r) => {
                      const tag = shareTag(r.address, supplier.operatorId, supplier.ownerId);
                      return (
                        <div key={r.address} style={{ fontSize: 12, marginBottom: 2 }}>
                          <b>{r.revSharePercentage}%</b> <Hash value={r.address} href={`/account/${r.address}`} />
                          {tag ? <span className="dim"> ({tag})</span> : null}
                        </div>
                      );
                    })
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
