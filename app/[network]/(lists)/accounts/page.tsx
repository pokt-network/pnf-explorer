import type { Metadata } from 'next';
import { NetLink as Link } from '@/components/shell/NetLink';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { Tic } from '@/components/ui/Icons';
import { SummaryCard, DOT } from '@/components/ui/SummaryCard';
import { Pager } from '@/components/ui/Pager';
import { Hash } from '@/components/ui/Hash';
import { EmptyState } from '@/components/ui/states';
import { getAccountList, getAccountSummary, getTotalSupplyUpokt } from '@/lib/data/accounts';
import type { NetworkId } from '@/lib/networks';
import { formatNumber, formatPokt } from '@/lib/format';

export const metadata: Metadata = { title: 'Top Accounts' };

const PAGE_SIZE = 10;

/** Share of total supply: amount / total, as a percentage string, or '—' when unknown. */
function share(amount: string, total: number | null): string {
  if (total == null || total === 0) return '—';
  const pct = (Number(amount) / total) * 100;
  if (!Number.isFinite(pct)) return '—';
  if (pct === 0) return '0%';
  if (pct < 0.001) return '<0.001%';
  return `${pct.toFixed(pct < 1 ? 3 : 2)}%`;
}

export default async function AccountsPage({
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

  const [list, summary, totalSupply] = await Promise.all([
    getAccountList(network, PAGE_SIZE, offset),
    getAccountSummary(network),
    getTotalSupplyUpokt(network),
  ]);
  const { nodes, totalCount } = list;
  const from = totalCount === 0 ? 0 : offset + 1;
  const to = Math.min(offset + PAGE_SIZE, totalCount);

  return (
    <>
      <Breadcrumb items={[{ label: 'Home', href: '/' }, { label: 'Accounts' }]} />
      <div className="listhead">
        <Tic entity="account" iconSize={20} />
        <h1>Top Accounts</h1>
        <span className="cnt">
          Showing {formatNumber(from)}–{formatNumber(to)} of {formatNumber(totalCount)}
        </span>
      </div>

      <div className="sumrow">
        <SummaryCard label="Accounts w/ Balance" dot={DOT.blue} value={summary.accountsWithBalance != null ? formatNumber(summary.accountsWithBalance) : '—'} />
        <SummaryCard label="Active Today" dot={DOT.mint} value={summary.todayAccounts != null ? formatNumber(summary.todayAccounts) : '—'} />
        <SummaryCard label="Active 30d" dot={DOT.gold} value={summary.monthAccounts != null ? formatNumber(summary.monthAccounts) : '—'} />
        <SummaryCard label="Active 90d" dot={DOT.lavender} value={summary.last90DaysAccounts != null ? formatNumber(summary.last90DaysAccounts) : '—'} />
      </div>

      <div className="card">
        <div className="tbl-scroll">
          <table className="tbl">
            <thead>
              <tr>
                <th className="rank">#</th>
                <th>Address</th>
                <th className="num">Balance</th>
                <th className="num">Share</th>
                <th>Last Active</th>
              </tr>
            </thead>
            <tbody>
              {nodes.map((a, i) => (
                <tr key={a.accountId}>
                  <td className="rank">{formatNumber(offset + i + 1)}</td>
                  <td>
                    <Hash value={a.accountId} href={`/account/${a.accountId}`} head={10} tail={6} />
                  </td>
                  <td className="num mono">{formatPokt(a.amount)} POKT</td>
                  <td className="num dim">{share(a.amount, totalSupply)}</td>
                  <td className="dim">
                    {a.lastUpdatedBlock ? (
                      <Link href={`/block/${a.lastUpdatedBlock.height}`}>#{formatNumber(a.lastUpdatedBlock.height)}</Link>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {nodes.length === 0 ? <EmptyState>No accounts found.</EmptyState> : <Pager page={page} pageSize={PAGE_SIZE} totalCount={totalCount} />}
      </div>
    </>
  );
}
