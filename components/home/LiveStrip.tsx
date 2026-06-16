'use client';

import { NetLink as Link } from '@/components/shell/NetLink';
import { useEffect, useState } from 'react';
import { useStatus } from '@/hooks/useStatus';
import { formatNumber } from '@/lib/format';

const POLL_SECONDS = 15;
const CIRC = 100.5; // 2π·16

// Home live strip (§8.7): network height + indexer freshness + a 15s poll countdown ring.
export function LiveStrip() {
  const { status, error } = useStatus();
  const [countdown, setCountdown] = useState(POLL_SECONDS);

  // Reset the countdown whenever a fresh status arrives; tick down each second.
  useEffect(() => {
    setCountdown(POLL_SECONDS);
  }, [status?.height]);
  useEffect(() => {
    const id = setInterval(() => setCountdown((c) => (c <= 0 ? POLL_SECONDS : c - 1)), 1000);
    return () => clearInterval(id);
  }, []);

  const healthy = status ? status.healthy && !error : false;
  const dotColor = error ? 'var(--coral)' : healthy ? 'var(--mint)' : status ? 'var(--gold)' : 'var(--text-tertiary)';
  const indexerLabel = error
    ? 'Indexer unreachable'
    : !status
      ? 'Connecting…'
      : healthy
        ? 'Indexer healthy · synced to head'
        : `Indexer behind head by ${status.lag} blocks`;

  const dashoffset = CIRC * (1 - Math.max(0, countdown) / POLL_SECONDS);

  return (
    <section className="card livestrip">
      <div className="left">
        <div className="heightpill">
          <span className="k">Network Height</span>
          <span className="v">{status ? <Link href={`/block/${status.height}`}>#{formatNumber(status.height)}</Link> : '—'}</span>
        </div>
        <div className="indexer">
          <span className="pulse" style={{ width: 8, height: 8, borderRadius: '50%', background: dotColor, display: 'inline-block' }} />
          {indexerLabel}
        </div>
      </div>
      <div className="ring-count">
        <div className="live">
          <span className="pulse" style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--mint)', display: 'inline-block' }} />
          Live
        </div>
        <div className="countdown" title={`Refreshing every ${POLL_SECONDS}s`}>
          <svg width="34" height="34" viewBox="0 0 36 36">
            <circle cx="18" cy="18" r="16" fill="none" stroke="var(--bg-surface)" strokeWidth="2" />
            <circle
              cx="18"
              cy="18"
              r="16"
              fill="none"
              stroke="var(--blue)"
              strokeWidth="2"
              strokeLinecap="round"
              strokeDasharray={CIRC}
              strokeDashoffset={dashoffset}
              style={{ transition: 'stroke-dashoffset 1s linear', transform: 'rotate(-90deg)', transformOrigin: 'center' }}
            />
          </svg>
          <span className="t">0:{String(Math.max(0, countdown)).padStart(2, '0')}</span>
        </div>
      </div>
    </section>
  );
}
