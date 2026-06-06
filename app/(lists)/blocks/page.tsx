import type { Metadata } from 'next';
import Link from 'next/link';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { Tic } from '@/components/ui/Icons';
import { SummaryCard, DOT } from '@/components/ui/SummaryCard';
import { Pager } from '@/components/ui/Pager';
import { ProposerLink } from '@/components/blocks/ProposerLink';
import { EmptyState } from '@/components/ui/states';
import { getBlockList, getBlockSummary } from '@/lib/data/blocks';
import { formatNumber, formatBlockTime } from '@/lib/format';
import { relativeTime, absoluteUtc } from '@/lib/time';

export const metadata: Metadata = { title: 'Blocks' };

const PAGE_SIZE = 10;

function kb(bytes: number | null): string {
  if (bytes == null) return '—';
  return `${(bytes / 1024).toFixed(1)} KB`;
}

export default async function BlocksPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const { page: pageParam } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);
  const offset = (page - 1) * PAGE_SIZE;

  const [list, summary] = await Promise.all([getBlockList(PAGE_SIZE, offset), getBlockSummary()]);
  const { nodes, totalCount } = list;
  const from = totalCount === 0 ? 0 : offset + 1;
  const to = Math.min(offset + PAGE_SIZE, totalCount);

  return (
    <>
      <Breadcrumb items={[{ label: 'Home', href: '/' }, { label: 'Blocks' }]} />
      <div className="listhead">
        <Tic entity="block" iconSize={20} />
        <h1>Blocks</h1>
        <span className="cnt">
          Showing {formatNumber(from)}–{formatNumber(to)} of {formatNumber(totalCount)}
        </span>
      </div>

      <div className="sumrow">
        <SummaryCard label="Latest Block" dot={DOT.blue} value={summary.latestHeight ? formatNumber(summary.latestHeight) : '—'} />
        <SummaryCard label="Txns (latest)" dot={DOT.gold} value={summary.latestTotalTxs != null ? formatNumber(summary.latestTotalTxs) : '—'} />
        <SummaryCard label="Avg Block Time (24h)" dot={DOT.mint} value={summary.avgTimeToBlock != null ? (summary.avgTimeToBlock / 1000).toFixed(2) : '—'} unit="s" />
        <SummaryCard label="Avg Size (24h)" dot={DOT.lavender} value={summary.avgSize != null ? (summary.avgSize / 1024).toFixed(1) : '—'} unit="KB" />
      </div>

      <div className="card">
        <div className="tbl-scroll">
          <table className="tbl">
            <thead>
              <tr>
                <th>Height</th>
                <th>Age</th>
                <th>Proposer</th>
                <th className="num">Txns</th>
                <th className="num">Relays</th>
                <th className="num">Time</th>
                <th className="num">Size</th>
              </tr>
            </thead>
            <tbody>
              {nodes.map((b) => (
                <tr key={b.height}>
                  <td>
                    <Link href={`/block/${b.height}`}>{formatNumber(b.height)}</Link>
                  </td>
                  <td className="dim" title={absoluteUtc(b.timestamp)}>
                    {relativeTime(b.timestamp)}
                  </td>
                  <td>
                    <ProposerLink address={b.proposerAddress} />
                  </td>
                  <td className="num">{formatNumber(b.totalTxs)}</td>
                  <td className="num">{b.totalRelays != null ? formatNumber(b.totalRelays) : '—'}</td>
                  <td className="num">{formatBlockTime(b.timeToBlock)}</td>
                  <td className="num dim">{kb(b.size)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {nodes.length === 0 ? <EmptyState>No blocks found.</EmptyState> : <Pager page={page} pageSize={PAGE_SIZE} totalCount={totalCount} />}
      </div>
    </>
  );
}
