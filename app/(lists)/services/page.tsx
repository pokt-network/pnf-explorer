import type { Metadata } from 'next';
import Link from 'next/link';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { Tic } from '@/components/ui/Icons';
import { Pager } from '@/components/ui/Pager';
import { Hash } from '@/components/ui/Hash';
import { EmptyState } from '@/components/ui/states';
import { getServiceList, getServiceActiveSupplierCounts } from '@/lib/data/services';
import { formatNumber } from '@/lib/format';

export const metadata: Metadata = { title: 'Services' };

const PAGE_SIZE = 25;

export default async function ServicesPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const { page: pageParam } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);
  const offset = (page - 1) * PAGE_SIZE;

  const { nodes, totalCount } = await getServiceList(PAGE_SIZE, offset);
  // Active supplier counts batched into one 12h-cached query for just this page's services.
  const counts = await getServiceActiveSupplierCounts(nodes.map((n) => n.id));
  const from = totalCount === 0 ? 0 : offset + 1;
  const to = Math.min(offset + PAGE_SIZE, totalCount);

  return (
    <>
      <Breadcrumb items={[{ label: 'Home', href: '/' }, { label: 'Services' }]} />
      <div className="listhead">
        <Tic entity="service" iconSize={20} />
        <h1>Services</h1>
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
                <th>Service</th>
                <th>Service ID</th>
                <th className="num">CU / Relay</th>
                <th className="num">Active Suppliers</th>
                <th>Owner</th>
              </tr>
            </thead>
            <tbody>
              {nodes.map((s, i) => (
                <tr key={s.id}>
                  <td className="rank">{offset + i + 1}</td>
                  <td>
                    <Link href={`/service/${s.id}`}>{s.name ?? s.id}</Link>
                  </td>
                  <td className="mono dim">{s.id}</td>
                  <td className="num">{s.computeUnitsPerRelay != null ? formatNumber(s.computeUnitsPerRelay) : '—'}</td>
                  <td className="num">{formatNumber(counts.get(s.id) ?? 0)}</td>
                  <td className="mono">
                    {s.ownerId ? <Hash value={s.ownerId} href={`/account/${s.ownerId}`} /> : <span className="dim">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {nodes.length === 0 ? (
          <EmptyState>No services found.</EmptyState>
        ) : (
          <Pager page={page} pageSize={PAGE_SIZE} totalCount={totalCount} />
        )}
      </div>
    </>
  );
}
