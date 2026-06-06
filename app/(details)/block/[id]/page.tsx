import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { Tic } from '@/components/ui/Icons';
import { Hash } from '@/components/ui/Hash';
import { CopyButton } from '@/components/ui/CopyButton';
import { Tabs } from '@/components/ui/Tabs';
import { RawJson } from '@/components/ui/RawJson';
import { EmptyState } from '@/components/ui/states';
import { IndexerBanner } from '@/components/ui/IndexerBanner';
import { TxTable } from '@/components/tx/TxTable';
import { ProposerLink } from '@/components/blocks/ProposerLink';
import { getUseRpcData } from '@/lib/metadata';
import { resolveBlock, getBlockTransactions } from '@/lib/data/blocks';
import { formatNumber, formatPoktCompact, formatUpokt, formatBlockTime } from '@/lib/format';
import { relativeTime, absoluteUtc } from '@/lib/time';
import { sumUpokt } from '@/lib/tx';

const TX_TAB_LIMIT = 25;

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const title = /^\d+$/.test(id) ? `Block #${formatNumber(id)}` : `Block ${id.slice(0, 10)}…`;
  return { title };
}

function StakedLine({ label, count, tokens }: { label: string; count: number; tokens?: string | null }) {
  return (
    <div className="line">
      <div className="k">{label}</div>
      <div className="v">
        {formatNumber(count)}
        {tokens ? <span className="dim"> · {formatPoktCompact(tokens)} POKT</span> : null}
      </div>
    </div>
  );
}

export default async function BlockDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const fallback = await getUseRpcData();
  const block = await resolveBlock(id, fallback);
  if (!block) notFound();

  const height = Number(block.height);
  const target = fallback.metadata?.targetHeight ?? null;
  const failed = Math.max(0, block.totalTxs - block.successfulTxs);
  const fromRpc = block.source === 'rpc';

  // Transactions tab — first page at this height (indexer only; RPC tx decoding is out of scope).
  let txs: Awaited<ReturnType<typeof getBlockTransactions>> | null = null;
  if (!fromRpc && block.totalTxs > 0) {
    txs = await getBlockTransactions(block.height, TX_TAB_LIMIT, 0, target);
  }

  const supplyUpokt = block.supplies?.nodes?.length ? sumUpokt(block.supplies.nodes.map((n) => n.supply)) : null;

  const txPanel = (
    <div className="card flush-top">
      {fromRpc ? (
        <EmptyState>Transaction details for this block require the indexer, which is currently behind.</EmptyState>
      ) : (
        <>
          <TxTable txs={txs?.nodes ?? []} columns={['type', 'signer', 'fee', 'result']} empty="No transactions in this block." />
          {txs && txs.totalCount > TX_TAB_LIMIT ? (
            <div className="pager">
              <span>
                Showing first {TX_TAB_LIMIT} of {formatNumber(txs.totalCount)} transactions
              </span>
            </div>
          ) : null}
        </>
      )}
    </div>
  );

  const metaPanel = block.metadata ? (
    <RawJson title="Block Metadata" source="header · lastCommit · blockId" data={block.metadata} />
  ) : (
    <div className="card flush-top">
      <EmptyState>Block metadata is not available{fromRpc ? ' in RPC fallback mode' : ''}.</EmptyState>
    </div>
  );

  return (
    <>
      <Breadcrumb items={[{ label: 'Home', href: '/' }, { label: 'Blocks', href: '/blocks' }, { label: `#${formatNumber(block.height)}` }]} />

      {fallback.useRpc ? <IndexerBanner lag={fallback.lag} /> : null}

      <div className="pagetitle">
        <Tic entity="block" />
        <div>
          <h1>Block #{formatNumber(block.height)}</h1>
          <div className="hash">
            <Hash value={block.hash} full copy />
          </div>
        </div>
        <div className="blocknav">
          {height > 1 ? (
            <Link href={`/block/${height - 1}`} title="Previous block">
              ‹
            </Link>
          ) : (
            <span className="blocknav" style={{ opacity: 0.4 }}>
              ‹
            </span>
          )}
          {target == null || height < target ? (
            <Link href={`/block/${height + 1}`} title="Next block">
              ›
            </Link>
          ) : (
            <span style={{ opacity: 0.4, width: 32, height: 32, display: 'grid', placeItems: 'center' }}>›</span>
          )}
        </div>
      </div>

      <div className="card kv">
        <div className="line">
          <div className="k">Block Height</div>
          <div className="v">{formatNumber(block.height)}</div>
        </div>
        <div className="line">
          <div className="k">Timestamp</div>
          <div className="v">
            {relativeTime(block.timestamp)} <span className="muted">({absoluteUtc(block.timestamp)})</span>
          </div>
        </div>
        <div className="line">
          <div className="k">Block Hash</div>
          <div className="v">
            <span className="mono">{block.hash}</span> <CopyButton value={block.hash} />
          </div>
        </div>
        <div className="line">
          <div className="k">Proposer</div>
          <div className="v">
            <ProposerLink address={block.proposerAddress} full />
          </div>
        </div>
        <div className="line">
          <div className="k">Transactions</div>
          <div className="v">
            {formatNumber(block.totalTxs)} transactions{' '}
            <span className="dim">
              · {formatNumber(block.successfulTxs)} successful · {formatNumber(failed)} failed
            </span>
          </div>
        </div>
        <div className="line">
          <div className="k">Block Time</div>
          <div className="v">{formatBlockTime(block.timeToBlock)}</div>
        </div>
        <div className="line">
          <div className="k">Size</div>
          <div className="v">{block.size != null ? `${formatNumber(block.size)} bytes` : '—'}</div>
        </div>
        <div className="line">
          <div className="k">Total Relays</div>
          <div className="v">{block.totalRelays != null ? formatNumber(block.totalRelays) : '—'}</div>
        </div>
        <div className="line">
          <div className="k">Computed Units</div>
          <div className="v">{block.totalComputedUnits != null ? formatNumber(block.totalComputedUnits) : '—'}</div>
        </div>
        <StakedLine label="Staked Suppliers" count={block.stakedSuppliers} tokens={block.stakedSuppliersTokens} />
        <StakedLine label="Staked Apps" count={block.stakedApps} tokens={block.stakedAppsTokens} />
        <StakedLine label="Staked Gateways" count={block.stakedGateways} tokens={block.stakedGatewaysTokens} />
        {supplyUpokt != null ? (
          <div className="line">
            <div className="k">Supply</div>
            <div className="v">
              {formatPoktCompact(supplyUpokt.toString())} POKT <span className="muted">({formatUpokt(supplyUpokt.toString())} upokt)</span>
            </div>
          </div>
        ) : null}
      </div>

      <Tabs
        tabs={[
          { key: 'txs', label: 'Transactions', badge: block.totalTxs, panel: txPanel },
          { key: 'meta', label: 'Metadata', panel: metaPanel },
        ]}
      />
    </>
  );
}
