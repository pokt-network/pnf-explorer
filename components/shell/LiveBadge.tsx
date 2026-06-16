'use client';

import { NetLink as Link } from '@/components/shell/NetLink';
import { useStatus } from '@/hooks/useStatus';
import { formatNumber } from '@/lib/format';

// Global live block-height badge (§1): client-polled 15s. Mint = healthy/synced,
// gold = indexer lagging head, coral = unreachable. Links to the latest block.
export function LiveBadge() {
  const { status, error, loading } = useStatus();

  let color = 'var(--text-tertiary)';
  let label = 'Syncing';
  if (status) {
    if (error) {
      color = 'var(--coral)';
      label = 'Stale';
    } else if (status.healthy) {
      color = 'var(--mint)';
      label = 'Live';
    } else {
      color = 'var(--gold)';
      label = `Lag ${status.lag}`;
    }
  } else if (error) {
    color = 'var(--coral)';
    label = 'Offline';
  }

  const height = status ? `#${formatNumber(status.height)}` : '—';
  const title = status
    ? error
      ? 'Indexer unreachable — last known height'
      : status.healthy
        ? 'Indexer healthy · synced to head'
        : `Indexer behind head by ${status.lag} blocks`
    : 'Loading network height';

  const body = (
    <>
      <span className={`dot${!error && status ? ' pulse' : ''}`} style={{ background: color }} />
      <span className="lbl">{label}</span>
      <span className="h">{height}</span>
    </>
  );

  if (status && !error) {
    return (
      <Link className="livebadge" href={`/block/${status.height}`} title={title} aria-label={`${title}, ${height}`}>
        {body}
      </Link>
    );
  }
  return (
    <div className={`livebadge${loading ? ' is-loading' : ''}`} title={title} aria-label={title}>
      {body}
    </div>
  );
}
