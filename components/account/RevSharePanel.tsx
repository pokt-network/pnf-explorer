import { NetLink as Link } from '@/components/shell/NetLink';
import { Hash } from '@/components/ui/Hash';
import { Pager } from '@/components/ui/Pager';
import { EmptyState } from '@/components/ui/states';
import { getRevShareConfigs } from '@/lib/data/accounts';
import type { NetworkId } from '@/lib/networks';

const LIMIT = 25;

/**
 * Rev-share recipient tab: supplier→service configs that pay this address a cut, with the address's
 * own percentage on each row (parsed from the config's revShare[]). Reverse of the operator's
 * Services tab. Paged via `?revshare=` — a payout address can appear on hundreds of configs.
 */
export async function RevSharePanel({ network, address, page }: { network: NetworkId; address: string; page: number }) {
  let data: Awaited<ReturnType<typeof getRevShareConfigs>> | null = null;
  try {
    data = await getRevShareConfigs(network, address, LIMIT, (page - 1) * LIMIT);
  } catch {
    return <div className="card flush-top"><EmptyState>Couldn’t load rev-share right now.</EmptyState></div>;
  }
  if (data.nodes.length === 0 && page === 1) {
    return <div className="card flush-top"><EmptyState>This address receives no supplier rev-share.</EmptyState></div>;
  }

  return (
    <div className="card flush-top">
      <div className="tbl-scroll">
        <table className="tbl">
          <thead>
            <tr>
              <th>Supplier</th>
              <th>Service</th>
              <th className="num">This share</th>
            </tr>
          </thead>
          <tbody>
            {data.nodes.map((c, i) => {
              const mine = c.revShare.find((r) => r.address === address);
              return (
                <tr key={`${c.supplierId}-${c.serviceId}-${i}`}>
                  <td>
                    <Hash value={c.supplierId} href={`/account/${c.supplierId}`} />
                  </td>
                  <td>
                    <Link href={`/service/${c.serviceId}`} className="mono">{c.serviceId}</Link>
                  </td>
                  <td className="num">{mine ? `${mine.revSharePercentage}%` : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {data.totalCount > LIMIT ? <Pager page={page} pageSize={LIMIT} totalCount={data.totalCount} param="revshare" /> : null}
    </div>
  );
}
