import type { Metadata } from 'next';
import Link from 'next/link';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { Tic } from '@/components/ui/Icons';
import { Pager } from '@/components/ui/Pager';
import { Hash } from '@/components/ui/Hash';
import { EmptyState } from '@/components/ui/states';
import { getAllServicesWithCounts } from '@/lib/data/services';
import { formatNumber } from '@/lib/format';

export const metadata: Metadata = { title: 'Services' };

const PAGE_SIZE = 25;
type SortKey = 'name' | 'cu' | 'suppliers';
type Dir = 'asc' | 'desc';

export default async function ServicesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; sort?: string; dir?: string }>;
}) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const sort: SortKey = sp.sort === 'cu' || sp.sort === 'suppliers' ? sp.sort : 'name';
  // Default direction: name → asc; numeric columns → desc (highest first).
  const dir: Dir = sp.dir === 'asc' ? 'asc' : sp.dir === 'desc' ? 'desc' : sort === 'name' ? 'asc' : 'desc';

  const all = await getAllServicesWithCounts();
  const sign = dir === 'asc' ? 1 : -1;
  const sorted = [...all].sort((a, b) => {
    if (sort === 'cu') return sign * (Number(a.computeUnitsPerRelay ?? 0) - Number(b.computeUnitsPerRelay ?? 0));
    if (sort === 'suppliers') return sign * (a.activeSuppliers - b.activeSuppliers);
    return sign * (a.name ?? a.id).localeCompare(b.name ?? b.id);
  });

  const totalCount = sorted.length;
  const offset = (page - 1) * PAGE_SIZE;
  const pageRows = sorted.slice(offset, offset + PAGE_SIZE);
  const from = totalCount === 0 ? 0 : offset + 1;
  const to = Math.min(offset + PAGE_SIZE, totalCount);

  // Clicking a sortable column toggles desc→asc (defaults to desc); resets to page 1.
  const sortHref = (col: SortKey) => `/services?sort=${col}&dir=${sort === col && dir === 'desc' ? 'asc' : 'desc'}`;
  const arrow = (col: SortKey) => (sort === col ? (dir === 'asc' ? ' ↑' : ' ↓') : '');

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
                <th className="num">
                  <Link className="th-sort" href={sortHref('cu')}>
                    CU / Relay{arrow('cu')}
                  </Link>
                </th>
                <th className="num">
                  <Link className="th-sort" href={sortHref('suppliers')}>
                    Active Suppliers{arrow('suppliers')}
                  </Link>
                </th>
                <th>Owner</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((s, i) => (
                <tr key={s.id}>
                  <td className="rank">{offset + i + 1}</td>
                  <td>
                    <Link href={`/service/${s.id}`}>{s.name ?? s.id}</Link>
                  </td>
                  <td className="mono dim">{s.id}</td>
                  <td className="num">{s.computeUnitsPerRelay != null ? formatNumber(s.computeUnitsPerRelay) : '—'}</td>
                  <td className="num">{formatNumber(s.activeSuppliers)}</td>
                  <td className="mono">
                    {s.ownerId ? <Hash value={s.ownerId} href={`/account/${s.ownerId}`} /> : <span className="dim">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {pageRows.length === 0 ? (
          <EmptyState>No services found.</EmptyState>
        ) : (
          <Pager page={page} pageSize={PAGE_SIZE} totalCount={totalCount} />
        )}
      </div>
    </>
  );
}
