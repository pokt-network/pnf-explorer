import { Suspense } from 'react';
import { GlobalSearch } from '@/components/shell/GlobalSearch';
import { LiveStrip } from '@/components/home/LiveStrip';
import { RecentBlocks } from '@/components/home/RecentBlocks';
import { RecentTxs } from '@/components/home/RecentTxs';
import { getHomeSummary } from '@/lib/data/home';
import { getNetwork, type NetworkId } from '@/lib/networks';
import { formatPoktCompact, formatCompact, formatNumber } from '@/lib/format';

// Home: hero + search, live strip, 4 network summary cards, latest blocks + txs (§6 — no charts).
export default async function Home({ params }: { params: Promise<{ network: NetworkId }> }) {
  const { network } = await params;
  const summary = await getHomeSummary(network);
  const net = getNetwork(network);
  // Supply is a meaningful, verifiable figure on mainnet; on testnets it's inflated by test
  // minting, so we keep the (truthful) on-chain value but drop the "verifiable" framing.
  const supplyCaption = net.isDefault ? 'Verifiable on-chain' : `${net.label} · test value`;

  return (
    <>
      <section className="hero">
        <h1>
          The Pocket Network <span className="accent">Explorer</span>
        </h1>
        <p>Search the network by block, transaction, account, or validator.</p>
        <GlobalSearch variant="hero" />
      </section>

      <LiveStrip />

      <section className="stats">
        <div className="card stat hov">
          <div className="label">
            <span className="dot" style={{ background: 'var(--blue)' }} />
            Total Supply
          </div>
          <div className="val">
            {summary.supplyUpokt ? formatPoktCompact(summary.supplyUpokt) : '—'}
            <span className="unit">POKT</span>
          </div>
          <div className="sub">{supplyCaption}</div>
          <div className="badge-icon" style={{ background: 'rgba(2,90,242,.12)' }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--blue-soft)" strokeWidth="2.2" strokeLinecap="round">
              <line x1="12" y1="1" x2="12" y2="23" />
              <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
            </svg>
          </div>
        </div>

        <div className="card stat hov">
          <div className="label">
            <span className="dot" style={{ background: 'var(--gold)' }} />
            24h Relays
          </div>
          <div className="val">{summary.relays24h ? formatCompact(summary.relays24h) : '—'}</div>
          <div className="sub">Across the network</div>
          <div className="badge-icon" style={{ background: 'rgba(255,197,71,.12)' }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
            </svg>
          </div>
        </div>

        <div className="card stat hov">
          <div className="label">
            <span className="dot" style={{ background: 'var(--mint)' }} />
            24h Computed Units
          </div>
          <div className="val">{summary.cu24h ? formatCompact(summary.cu24h) : '—'}</div>
          <div className="sub">Relay-weighted work</div>
          <div className="badge-icon" style={{ background: 'rgba(72,229,194,.12)' }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--mint)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="4" y="4" width="16" height="16" rx="2" />
              <path d="M9 9h6v6H9z" />
              <path d="M9 1v3M15 1v3M9 20v3M15 20v3M1 9h3M1 15h3M20 9h3M20 15h3" />
            </svg>
          </div>
        </div>

        <div className="card stat hov">
          <div className="label">
            <span className="dot" style={{ background: 'var(--lavender)' }} />
            Staked Actors
          </div>
          <div className="val">{summary.stakedActors != null ? formatNumber(summary.stakedActors) : '—'}</div>
          <div className="sub">Suppliers · Apps · Gateways</div>
          <div className="badge-icon" style={{ background: 'rgba(184,184,255,.14)' }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--lavender)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
          </div>
        </div>
      </section>

      <section className="cols">
        <Suspense fallback={<div className="card panel" style={{ minHeight: 360 }} />}>
          <RecentBlocks network={network} />
        </Suspense>
        <Suspense fallback={<div className="card panel" style={{ minHeight: 360 }} />}>
          <RecentTxs network={network} />
        </Suspense>
      </section>
    </>
  );
}
