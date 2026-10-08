import type { Metadata } from 'next';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { Tic } from '@/components/ui/Icons';
import { SummaryCard, DOT } from '@/components/ui/SummaryCard';
import { Pager } from '@/components/ui/Pager';
import { TxTable } from '@/components/tx/TxTable';
import { TxFilterChips } from '@/components/tx/TxFilterChips';
import { getTransactionsList, getTransactionsSummary, hasChainTotal, txFilterKey } from '@/lib/data/transactions';
import type { NetworkId } from '@/lib/networks';
import { formatNumber } from '@/lib/format';

export const metadata: Metadata = {
  title: 'Transactions',
  description: 'Latest transactions on Pocket Network — types, status, and fees.',
};

const PAGE_SIZE = 10;

export default async function TxsPage({
  params,
  searchParams,
}: {
  params: Promise<{ network: NetworkId }>;
  searchParams: Promise<{ page?: string; type?: string }>;
}) {
  const { network } = await params;
  const { page: pageParam, type: typeParam } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);
  const offset = (page - 1) * PAGE_SIZE;
  const filter = txFilterKey(typeParam);

  // Only the chips the per-block counters total (all/success/failed) show a total. Counting a message-type
  // chip means counting tens of millions of rows (MsgClaim and MsgProof hit the API's 30 s timeout), so those
  // fetch one extra row to know whether a next page exists.
  const [list, summary] = await Promise.all([
    getTransactionsList(network, PAGE_SIZE + 1, offset, filter, false),
    getTransactionsSummary(network, filter),
  ]);
  const hasNext = list.nodes.length > PAGE_SIZE;
  const nodes = list.nodes.slice(0, PAGE_SIZE);
  const totalCount = hasChainTotal(filter) ? (summary.chainTotal ?? 0) : null;
  const from = nodes.length === 0 ? 0 : offset + 1;
  const to = offset + nodes.length;

  return (
    <>
      <Breadcrumb items={[{ label: 'Home', href: '/' }, { label: 'Transactions' }]} />
      <div className="listhead">
        <Tic entity="tx" iconSize={20} />
        <h1>Transactions</h1>
        <span className="cnt">
          Showing {formatNumber(from)}–{formatNumber(to)}
          {totalCount != null ? <> of {formatNumber(totalCount)}</> : null}
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
        {nodes.length > 0 ? <Pager page={page} pageSize={PAGE_SIZE} totalCount={totalCount} hasNext={hasNext} /> : null}
      </div>
    </>
  );
}
