import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { NetLink as Link } from '@/components/shell/NetLink';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { Tic } from '@/components/ui/Icons';
import { Hash } from '@/components/ui/Hash';
import { Tabs } from '@/components/ui/Tabs';
import { RawJson } from '@/components/ui/RawJson';
import { CursorPager } from '@/components/morse/CursorPager';
import { MorseTxTable } from '@/components/morse/MorseTxTable';
import { ChainList } from '@/components/morse/pills';
import { MORSE_FINAL_HEIGHT, getMorseBlock, getMorseTxs, morseHeight } from '@/lib/morse/api';
import { formatBytes, formatTook, parseCursor } from '@/lib/morse/format';
import { formatNumber, formatPoktCompact } from '@/lib/format';
import { absoluteUtc } from '@/lib/time';

const TX_TAB_LIMIT = 25;

export async function generateMetadata({ params }: { params: Promise<{ height: string }> }): Promise<Metadata> {
  const { height } = await params;
  const h = morseHeight(height);
  const which = h != null ? `#${formatNumber(h)}` : height.slice(0, 12);
  return {
    title: `Morse Block ${which}`,
    description: `Block ${which} of the archived Morse chain of Pocket Network — producer, transactions, and network state.`,
  };
}

function Line({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="line">
      <div className="k">{k}</div>
      <div className="v">{children}</div>
    </div>
  );
}

/** "9,815 · 521.81M POKT" — an actor count with the tokens it staked. */
function Staked({ count, tokens }: { count?: number; tokens?: string | null }) {
  return (
    <>
      {formatNumber(count ?? 0)}
      {tokens ? <span className="dim"> · {formatPoktCompact(tokens)} POKT</span> : null}
    </>
  );
}

const NavArrow = ({ to, label, glyph }: { to: number | null; label: string; glyph: string }) =>
  to != null ? (
    <Link href={`/morse/block/${to}`} title={label}>
      {glyph}
    </Link>
  ) : (
    <span style={{ opacity: 0.4, width: 32, height: 32, display: 'grid', placeItems: 'center' }}>{glyph}</span>
  );

export default async function MorseBlockPage({
  params,
  searchParams,
}: {
  params: Promise<{ height: string }>;
  searchParams: Promise<{ txs?: string }>;
}) {
  const height = morseHeight((await params).height);
  if (height == null) notFound();
  const txCursor = parseCursor((await searchParams).txs);
  const block = await getMorseBlock(height);
  if (!block) notFound();
  const txs = block.total_txs ? await getMorseTxs({ limit: TX_TAB_LIMIT, height, cursor: txCursor }) : null;

  const txPanel = (
    <div className="card flush-top">
      <MorseTxTable txs={txs?.items ?? []} columns={['type', 'from', 'to', 'amount', 'fee', 'result']} empty="No transactions in this block." />
      {txs && (txCursor || txs.next_cursor) ? <CursorPager cursor={txCursor} nextCursor={txs.next_cursor} pageSize={TX_TAB_LIMIT} param="txs" /> : null}
    </div>
  );

  return (
    <>
      <Breadcrumb items={[{ label: 'Morse', href: '/morse' }, { label: 'Blocks', href: '/morse/blocks' }, { label: `#${formatNumber(height)}` }]} />

      <div className="pagetitle">
        <Tic entity="block" />
        <div>
          <h1>
            Block #{formatNumber(height)}
            {height === MORSE_FINAL_HEIGHT ? <span className="statuspill sm s-unstk">Final block</span> : null}
          </h1>
          <div className="hash">Morse · {absoluteUtc(block.time)}</div>
        </div>
        <div className="blocknav">
          <NavArrow to={height > 1 ? height - 1 : null} label="Previous block" glyph="‹" />
          <NavArrow to={height < MORSE_FINAL_HEIGHT ? height + 1 : null} label="Next block" glyph="›" />
        </div>
      </div>

      <div className="card kv">
        <Line k="Block Height">{formatNumber(height)}</Line>
        <Line k="Timestamp">{absoluteUtc(block.time)}</Line>
        <Line k="Producer">
          <Hash value={block.producer} href={`/morse/node/${block.producer}`} full />
          {block.producer_service_url ? <span className="muted"> · {block.producer_service_url}</span> : null}
        </Line>
        <Line k="Transactions">
          {formatNumber(block.total_txs ?? 0)} transactions
          {block.total_good_txs != null ? (
            <span className="dim">
              {' '}
              · {formatNumber(block.total_good_txs)} successful · {formatNumber(block.total_bad_txs ?? 0)} failed
            </span>
          ) : null}
        </Line>
        <Line k="Block Time">{formatTook(block.took)} since the previous block</Line>
        <Line k="Size">
          {formatBytes(block.block_size)} block <span className="dim">· {formatBytes(block.state_size)} state · {formatBytes(block.total_size)} total</span>
        </Line>
        <Line k="Relays Completed">{formatNumber(block.total_relays_completed ?? 0)}</Line>
        <Line k="Staked Nodes">
          <Staked count={block.nodes_unjailed_staked} tokens={block.nodes_unjailed_staked_tokens} />
        </Line>
        <Line k="Unstaking Nodes">
          <Staked count={block.nodes_unjailed_unstaking} tokens={block.nodes_unjailed_unstaking_tokens} />
        </Line>
        <Line k="Jailed Staked Nodes">
          <Staked count={block.nodes_jailed_staked} tokens={block.nodes_jailed_staked_tokens} />
        </Line>
        <Line k="Staked Apps">
          <Staked count={block.apps_staked} tokens={block.apps_staked_tokens} />
        </Line>
        <Line k="Unstaking Apps">
          <Staked count={block.apps_unstaking} tokens={block.apps_unstaking_tokens} />
        </Line>
        <Line k="Totals">
          {formatNumber(block.total_nodes ?? 0)} nodes <span className="dim">· {formatNumber(block.total_apps ?? 0)} apps · {formatNumber(block.total_accounts ?? 0)} accounts</span>
        </Line>
        <Line k="Blocks per Session">{block.block_per_session != null ? formatNumber(block.block_per_session) : '—'}</Line>
        <Line k="Supported Chains">
          <ChainList chains={block.supported_block_chains} />
        </Line>
      </div>

      <Tabs
        tabs={[
          { key: 'txs', label: 'Transactions', badge: block.total_txs ?? 0, panel: txPanel },
          { key: 'raw', label: 'Raw', panel: <RawJson title="Block" source="morse-api /v1/blocks/{height}" data={block} /> },
        ]}
      />
    </>
  );
}
