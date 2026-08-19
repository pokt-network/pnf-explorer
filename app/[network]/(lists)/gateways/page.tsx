import type { Metadata } from 'next';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { Tic } from '@/components/ui/Icons';
import { Pager } from '@/components/ui/Pager';
import { Hash } from '@/components/ui/Hash';
import { StakeStatusPill } from '@/components/ui/StatusPill';
import { EmptyState } from '@/components/ui/states';
import { getGatewayList } from '@/lib/data/gateways';
import type { NetworkId } from '@/lib/networks';
import { formatNumber, formatPokt } from '@/lib/format';

export const metadata: Metadata = { title: 'Gateways' };

const PAGE_SIZE = 25;

export default async function GatewaysPage({
  params,
  searchParams,
}: {
  params: Promise<{ network: NetworkId }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { network } = await params;
  const { page: pageParam } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);
  const offset = (page - 1) * PAGE_SIZE;

  const { nodes, totalCount } = await getGatewayList(network, PAGE_SIZE, offset);
  const from = totalCount === 0 ? 0 : offset + 1;
  const to = Math.min(offset + PAGE_SIZE, totalCount);

  return (
    <>
      <Breadcrumb items={[{ label: 'Home', href: '/' }, { label: 'Gateways' }]} />
      <div className="listhead">
        <Tic entity="gateway" iconSize={20} />
        <h1>Gateways</h1>
        <span className="cnt">
          Showing {formatNumber(from)}–{formatNumber(to)} of {formatNumber(totalCount)}
        </span>
      </div>

      <div className="card">
        <div className="tbl-scroll">
          <table className="tbl">
            <thead>
              <tr>
                <th className="rank">#</th>
                <th>Gateway</th>
                <th className="num">Stake</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {nodes.map((g, i) => (
                <tr key={g.id}>
                  <td className="rank">{offset + i + 1}</td>
                  <td className="mono">
                    <Hash value={g.id} href={`/account/${g.id}?as=gateway`} />
                  </td>
                  <td className="num mono">{formatPokt(g.stakeAmount ?? '0')} POKT</td>
                  <td>
                    <StakeStatusPill status={g.stakeStatus} sm />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {nodes.length === 0 ? (
          <EmptyState>No gateways found.</EmptyState>
        ) : (
          <Pager page={page} pageSize={PAGE_SIZE} totalCount={totalCount} />
        )}
      </div>
    </>
  );
}
