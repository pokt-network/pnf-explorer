import { Hash } from '@/components/ui/Hash';
import { Pager } from '@/components/ui/Pager';
import { EmptyState } from '@/components/ui/states';
import { StakeStatusPill } from '@/components/ui/StatusPill';
import { getOwnedOperators } from '@/lib/data/accounts';
import type { NetworkId } from '@/lib/networks';
import { formatPokt } from '@/lib/format';

const LIMIT = 25;

/**
 * Operators tab for an owner wallet: the supplier nodes this address owns (`ownerId == address`).
 * A large operation can own ~100 nodes, so the list is paged via `?ops=`.
 */
export async function OperatorsPanel({ network, address, page }: { network: NetworkId; address: string; page: number }) {
  let data: Awaited<ReturnType<typeof getOwnedOperators>> | null = null;
  try {
    data = await getOwnedOperators(network, address, LIMIT, (page - 1) * LIMIT);
  } catch {
    return <div className="card flush-top"><EmptyState>Couldn’t load operators right now.</EmptyState></div>;
  }
  if (data.nodes.length === 0 && page === 1) return <div className="card flush-top"><EmptyState>This address owns no operator nodes.</EmptyState></div>;

  return (
    <div className="card flush-top">
      <div className="tbl-scroll">
        <table className="tbl">
          <thead>
            <tr>
              <th>Operator</th>
              <th>Status</th>
              <th className="num">Stake</th>
              <th className="num">Services</th>
            </tr>
          </thead>
          <tbody>
            {data.nodes.map((op) => (
              <tr key={op.id}>
                <td>
                  <Hash value={op.id} href={`/account/${op.id}`} />
                </td>
                <td>
                  <StakeStatusPill status={op.stakeStatus} sm />
                </td>
                <td className="num mono">{formatPokt(op.stakeAmount)} POKT</td>
                <td className="num">{op.serviceConfigs.totalCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data.totalCount > LIMIT ? <Pager page={page} pageSize={LIMIT} totalCount={data.totalCount} param="ops" /> : null}
    </div>
  );
}
