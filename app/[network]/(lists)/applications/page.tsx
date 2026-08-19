import type { Metadata } from 'next';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { Tic } from '@/components/ui/Icons';
import { Pager } from '@/components/ui/Pager';
import { Hash } from '@/components/ui/Hash';
import { StakeStatusPill } from '@/components/ui/StatusPill';
import { EmptyState } from '@/components/ui/states';
import { getApplicationList } from '@/lib/data/applications';
import type { NetworkId } from '@/lib/networks';
import { formatNumber, formatPokt } from '@/lib/format';

export const metadata: Metadata = { title: 'Applications' };

const PAGE_SIZE = 25;

export default async function ApplicationsPage({
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

  const { nodes, totalCount } = await getApplicationList(network, PAGE_SIZE, offset);
  const from = totalCount === 0 ? 0 : offset + 1;
  const to = Math.min(offset + PAGE_SIZE, totalCount);

  return (
    <>
      <Breadcrumb items={[{ label: 'Home', href: '/' }, { label: 'Applications' }]} />
      <div className="listhead">
        <Tic entity="application" iconSize={20} />
        <h1>Applications</h1>
        <span className="cnt">
          Showing {formatNumber(from)}–{formatNumber(to)} of {formatNumber(totalCount)} active
        </span>
      </div>

      <div className="card">
        <div className="tbl-scroll">
          <table className="tbl">
            <thead>
              <tr>
                <th className="rank">#</th>
                <th>Application</th>
                <th className="num">Stake</th>
                <th className="num">Services</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {nodes.map((a, i) => (
                <tr key={a.id}>
                  <td className="rank">{offset + i + 1}</td>
                  <td className="mono">
                    <Hash value={a.id} href={`/account/${a.id}?as=application`} />
                  </td>
                  <td className="num mono">{formatPokt(a.stakeAmount ?? '0')} POKT</td>
                  <td className="num">{formatNumber(a.applicationServices?.totalCount ?? 0)}</td>
                  <td>
                    <StakeStatusPill status={a.stakeStatus} sm />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {nodes.length === 0 ? (
          <EmptyState>No applications found.</EmptyState>
        ) : (
          <Pager page={page} pageSize={PAGE_SIZE} totalCount={totalCount} />
        )}
      </div>
    </>
  );
}
