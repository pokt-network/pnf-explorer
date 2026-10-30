import type { Metadata } from 'next';
import { NetLink as Link } from '@/components/shell/NetLink';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { Tic } from '@/components/ui/Icons';
import { Hash } from '@/components/ui/Hash';
import { SummaryCard, DOT } from '@/components/ui/SummaryCard';
import { EmptyState } from '@/components/ui/states';
import { CursorPager } from '@/components/morse/CursorPager';
import { MORSE_FINAL_HEIGHT, getMorseBlocks, getMorseFinalBlock } from '@/lib/morse/api';
import { formatBytes, formatTook, parseCursor, utcShort } from '@/lib/morse/format';
import { formatNumber } from '@/lib/format';
import { absoluteUtc } from '@/lib/time';

export const metadata: Metadata = {
  title: 'Morse Blocks',
  description: 'Blocks of the archived Morse chain of Pocket Network, newest first — producers, transactions, and sizes.',
};

const PAGE_SIZE = 25;

export default async function MorseBlocksPage({ searchParams }: { searchParams: Promise<{ cursor?: string }> }) {
  const cursor = parseCursor((await searchParams).cursor);
  const [page, final] = await Promise.all([getMorseBlocks({ limit: PAGE_SIZE, cursor }), getMorseFinalBlock()]);

  return (
    <>
      <Breadcrumb items={[{ label: 'Morse', href: '/morse' }, { label: 'Blocks' }]} />
      <div className="listhead">
        <Tic entity="block" iconSize={20} />
        <h1>Blocks</h1>
        <span className="cnt">{formatNumber(MORSE_FINAL_HEIGHT)} blocks · newest first</span>
      </div>

      <div className="sumrow c3">
        <SummaryCard label="Final Height" dot={DOT.blue} value={formatNumber(MORSE_FINAL_HEIGHT)} sub={final?.time ? `${utcShort(final.time)} UTC` : undefined} />
        <SummaryCard label="Blocks per Session" dot={DOT.mint} value={final?.block_per_session != null ? formatNumber(final.block_per_session) : '—'} sub="At the final block" />
        <SummaryCard label="Supported Chains" dot={DOT.lavender} value={formatNumber(final?.supported_block_chains?.length ?? 0)} sub="Relay chains at the final block" />
      </div>

      <div className="card">
        {page.items.length === 0 ? (
          <EmptyState>No blocks found.</EmptyState>
        ) : (
          <div className="tbl-scroll">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Height</th>
                  <th>Time (UTC)</th>
                  <th>Producer</th>
                  <th className="num">Txns</th>
                  <th className="num">Nodes</th>
                  <th className="num">Took</th>
                  <th className="num">Size</th>
                </tr>
              </thead>
              <tbody>
                {page.items.map((b) => (
                  <tr key={b.height}>
                    <td>
                      <Link href={`/morse/block/${b.height}`}>{formatNumber(b.height)}</Link>
                    </td>
                    <td className="dim" title={absoluteUtc(b.time)}>
                      {utcShort(b.time)}
                    </td>
                    <td>
                      <Hash value={b.producer} href={`/morse/node/${b.producer}`} />
                    </td>
                    <td className="num">{formatNumber(b.total_txs ?? 0)}</td>
                    <td className="num">{b.total_nodes != null ? formatNumber(b.total_nodes) : '—'}</td>
                    <td className="num">{formatTook(b.took)}</td>
                    <td className="num dim">{formatBytes(b.block_size)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <CursorPager cursor={cursor} nextCursor={page.next_cursor} pageSize={PAGE_SIZE} />
      </div>
    </>
  );
}
