import type { Metadata } from 'next';
import { Suspense } from 'react';
import { NetLink as Link } from '@/components/shell/NetLink';
import { ArchiveSearch } from '@/components/morse/ArchiveSearch';
import { MorseTxResult, MorseTxType } from '@/components/morse/pills';
import { BlockIcon, InfoIcon, TxIcon } from '@/components/ui/Icons';
import { Hash } from '@/components/ui/Hash';
import { MORSE_FINAL_HEIGHT, getMorseBlocks, getMorseFinalBlock, getMorseTxs } from '@/lib/morse/api';
import { formatTook, utcShort } from '@/lib/morse/format';
import { formatNumber, formatPoktCompact, toBigInt } from '@/lib/format';
import { absoluteUtc } from '@/lib/time';

export const metadata: Metadata = {
  title: 'Morse Archive',
  description: 'Explore the archived Morse chain of Pocket Network — blocks, transactions, nodes, apps, and accounts up to its final height.',
};

/** A stat card, home-style: label with dot, value, sub line. */
function Stat({ label, color, value, unit, sub }: { label: string; color: string; value: string; unit?: string; sub: string }) {
  return (
    <div className="card stat">
      <div className="label">
        <span className="dot" style={{ background: color }} />
        {label}
      </div>
      <div className="val">
        {value}
        {unit ? <span className="unit">{unit}</span> : null}
      </div>
      <div className="sub">{sub}</div>
    </div>
  );
}

async function FinalBlocks() {
  const { items } = await getMorseBlocks({ limit: 10 });
  return (
    <div className="card panel">
      <div className="head">
        <h2>
          <span className="hicon" style={{ background: 'rgba(2,90,242,.12)' }}>
            <BlockIcon size={14} stroke="var(--blue-soft)" />
          </span>
          Final Blocks
        </h2>
        <Link className="viewall" href="/morse/blocks">
          View all →
        </Link>
      </div>
      {items.map((b) => (
        <div className="row" key={b.height}>
          <div className="ic">Bk</div>
          <div className="mid">
            <div className="top">
              <Link href={`/morse/block/${b.height}`}>{formatNumber(b.height)}</Link>
              <span className="age" title={absoluteUtc(b.time)}>
                {utcShort(b.time)}
              </span>
            </div>
            <div className="btm">
              Producer <Hash value={b.producer} href={`/morse/node/${b.producer}`} />
            </div>
          </div>
          <div className="end">
            <div className="amt">
              {formatNumber(b.total_txs ?? 0)}
              <span className="u">txns</span>
            </div>
            <div className="btm" style={{ justifyContent: 'flex-end', fontSize: '11.5px', color: 'var(--text-tertiary)', marginTop: 5 }}>
              {formatTook(b.took)}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

async function LastTxs() {
  const { items } = await getMorseTxs({ limit: 10 });
  return (
    <div className="card panel">
      <div className="head">
        <h2>
          <span className="hicon" style={{ background: 'rgba(255,197,71,.14)' }}>
            <TxIcon size={14} stroke="var(--gold)" />
          </span>
          Last Transactions
        </h2>
        <Link className="viewall" href="/morse/txs">
          View all →
        </Link>
      </div>
      {items.map((tx) => (
        <div className="row" key={tx.hash}>
          <div className="ic">Tx</div>
          <div className="mid">
            <div className="top">
              <Link href={`/morse/tx/${tx.hash}`} className="mono">
                {tx.hash.slice(0, 10)}…
              </Link>
              <span className="age" title={absoluteUtc(tx.block_time)}>
                {utcShort(tx.block_time)}
              </span>
            </div>
            <div className="btm">
              From {tx.from_address ? <Hash value={tx.from_address} href={`/morse/account/${tx.from_address}`} /> : '—'}
            </div>
          </div>
          <div className="end">
            <MorseTxType type={tx.type} />
            <div style={{ marginTop: 5 }}>
              <MorseTxResult pending={tx.pending} code={tx.result_code} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// The archive's home: what Morse was when it halted (from its final block), and its last blocks and txs.
export default async function MorseHome() {
  const final = await getMorseFinalBlock();
  const stakedNodes = (final?.nodes_unjailed_staked ?? 0) + (final?.nodes_jailed_staked ?? 0);
  const stakedNodeTokens = (toBigInt(final?.nodes_unjailed_staked_tokens) + toBigInt(final?.nodes_jailed_staked_tokens)).toString();

  return (
    <>
      <section className="hero">
        <h1>
          The Morse <span className="accent">Archive</span>
        </h1>
        <p>Search Pocket Network’s original Morse chain by block, transaction, node, app, or account.</p>
        <ArchiveSearch variant="hero" />
      </section>

      <div className="archive-note">
        <InfoIcon size={17} stroke="var(--text-secondary)" />
        <div className="ft">
          <b>Morse halted at block #{formatNumber(MORSE_FINAL_HEIGHT)}</b>
          {final?.time ? ` on ${absoluteUtc(final.time)}` : ''}. This archive is read-only; Pocket Network now runs on Shannon.
          Morse balances and stakes are claimed on Shannon — see the <Link href="/migration">Morse Migration</Link> or the{' '}
          <Link href="/">mainnet explorer</Link>.
        </div>
      </div>

      <section className="stats">
        <Stat label="Final Height" color="var(--text-secondary)" value={formatNumber(MORSE_FINAL_HEIGHT)} sub={final?.time ? utcShort(final.time) + ' UTC' : 'Chain halted'} />
        <Stat
          label="Staked Nodes"
          color="var(--coral)"
          value={formatNumber(stakedNodes)}
          sub={`${formatPoktCompact(stakedNodeTokens)} POKT staked · ${formatNumber(final?.nodes_unjailed_unstaking ?? 0)} unstaking`}
        />
        <Stat
          label="Staked Apps"
          color="var(--gold)"
          value={formatNumber(final?.apps_staked ?? 0)}
          sub={`${formatPoktCompact(final?.apps_staked_tokens)} POKT staked`}
        />
        <Stat label="Accounts" color="var(--blue)" value={formatNumber(final?.total_accounts ?? 0)} sub="At the final block" />
      </section>

      <section className="cols">
        <Suspense fallback={<div className="card panel" style={{ minHeight: 360 }} />}>
          <FinalBlocks />
        </Suspense>
        <Suspense fallback={<div className="card panel" style={{ minHeight: 360 }} />}>
          <LastTxs />
        </Suspense>
      </section>
    </>
  );
}
