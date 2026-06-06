import type { Metadata } from 'next';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { Tic } from '@/components/ui/Icons';
import { Pager } from '@/components/ui/Pager';
import { Hash } from '@/components/ui/Hash';
import { StakeStatusPill } from '@/components/ui/StatusPill';
import { EmptyState } from '@/components/ui/states';
import { getSupplierList } from '@/lib/data/suppliers';
import { formatNumber, formatPokt } from '@/lib/format';

export const metadata: Metadata = { title: 'Suppliers' };

const PAGE_SIZE = 25;

export default async function SuppliersPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const { page: pageParam } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);
  const offset = (page - 1) * PAGE_SIZE;

  const { nodes, totalCount } = await getSupplierList(PAGE_SIZE, offset);
  const from = totalCount === 0 ? 0 : offset + 1;
  const to = Math.min(offset + PAGE_SIZE, totalCount);

  return (
    <>
      <Breadcrumb items={[{ label: 'Home', href: '/' }, { label: 'Suppliers' }]} />
      <div className="listhead">
        <Tic entity="supplier" iconSize={20} />
        <h1>Suppliers</h1>
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
                <th>Supplier (operator)</th>
                <th>Owner</th>
                <th className="num">Stake</th>
                <th className="num">Services</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {nodes.map((s, i) => (
                <tr key={s.id}>
                  <td className="rank">{offset + i + 1}</td>
                  <td className="mono">
                    <Hash value={s.id} href={`/account/${s.id}`} />
                  </td>
                  <td className="mono">
                    {s.ownerId ? <Hash value={s.ownerId} href={`/account/${s.ownerId}`} /> : <span className="dim">—</span>}
                  </td>
                  <td className="num mono">{formatPokt(s.stakeAmount ?? '0')} POKT</td>
                  <td className="num">{formatNumber(s.serviceConfigs?.totalCount ?? 0)}</td>
                  <td>
                    <StakeStatusPill status={s.stakeStatus} sm />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {nodes.length === 0 ? (
          <EmptyState>No active suppliers found.</EmptyState>
        ) : (
          <Pager page={page} pageSize={PAGE_SIZE} totalCount={totalCount} />
        )}
      </div>
    </>
  );
}
