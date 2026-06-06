import type { Metadata } from 'next';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { Tic } from '@/components/ui/Icons';
import { SummaryCard, DOT } from '@/components/ui/SummaryCard';
import { Pager } from '@/components/ui/Pager';
import { TxTable } from '@/components/tx/TxTable';
import { TxFilterChips } from '@/components/tx/TxFilterChips';
import { getTransactionsList, getTransactionsSummary, txFilterKey } from '@/lib/data/transactions';
import { formatNumber } from '@/lib/format';

export const metadata: Metadata = { title: 'Transactions' };

const PAGE_SIZE = 10;

export default async function TxsPage({ searchParams }: { searchParams: Promise<{ page?: string; type?: string }> }) {
  const { page: pageParam, type: typeParam } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);
  const offset = (page - 1) * PAGE_SIZE;
  const filter = txFilterKey(typeParam);

  const [list, summary] = await Promise.all([getTransactionsList(PAGE_SIZE, offset, filter), getTransactionsSummary()]);
  const { nodes, totalCount } = list;
  const from = totalCount === 0 ? 0 : offset + 1;
  const to = Math.min(offset + PAGE_SIZE, totalCount);

  return (
    <>
      <Breadcrumb items={[{ label: 'Home', href: '/' }, { label: 'Transactions' }]} />
      <div className="listhead">
        <Tic entity="tx" iconSize={20} />
        <h1>Transactions</h1>
        <span className="cnt">
          Showing {formatNumber(from)}–{formatNumber(to)} of {formatNumber(totalCount)}
        </span>
      </div>

      <div className="sumrow c3">
        <SummaryCard
          label="Total (latest block)"
          dot={DOT.blue}
          value={summary.latestBlockTxs != null ? formatNumber(summary.latestBlockTxs) : '—'}
        />
        <SummaryCard label="Successful (24h)" dot={DOT.mint} value={formatNumber(summary.successful24h)} />
        <SummaryCard label="Failed (24h)" dot={DOT.coral} value={formatNumber(summary.failed24h)} />
      </div>

      <TxFilterChips active={filter} />

      <div className="card">
        <TxTable txs={nodes} columns={['type', 'block', 'age', 'signer', 'fee', 'result']} empty="No transactions found." />
        {nodes.length > 0 ? <Pager page={page} pageSize={PAGE_SIZE} totalCount={totalCount} /> : null}
      </div>
    </>
  );
}
