import { EmptyState } from '@/components/ui/states';
import { formatNumber } from '@/lib/format';
import type { UptimeResult } from '@/lib/data/validators';

const MAX_CELLS = 200;

/**
 * Recent block-production uptime (§8). produced/missed are arrays of block heights over a
 * ~2000-block window (DATA-CONTRACT §9). We render the most-recent window as a grid of up to
 * 200 cells, sampling evenly when the window is larger so the grid stays honest about density.
 */
export function UptimeGrid({ uptime }: { uptime: UptimeResult | null }) {
  if (!uptime) {
    return (
      <div className="card flush-top">
        <EmptyState>Uptime data unavailable for this validator.</EmptyState>
      </div>
    );
  }

  const produced = uptime.produced.length;
  const missed = uptime.missed.length;
  const total = produced + missed;

  if (total === 0) {
    return (
      <div className="card flush-top">
        <EmptyState>No block-production data in the recent window for this validator.</EmptyState>
      </div>
    );
  }

  const pct = (produced / total) * 100;
  const good = pct >= 99;

  // Build an ordered timeline of heights → produced/missed, then sample down to MAX_CELLS.
  const missedSet = new Set(uptime.missed);
  const allHeights: number[] = [...uptime.produced, ...uptime.missed].sort((a, b) => a - b);
  // Take the most recent slice when there are more heights than cells.
  const windowHeights = allHeights.length > MAX_CELLS ? allHeights.slice(allHeights.length - MAX_CELLS) : allHeights;
  const step = windowHeights.length > MAX_CELLS ? Math.ceil(windowHeights.length / MAX_CELLS) : 1;

  const cells: { height: number; miss: boolean }[] = [];
  for (let i = 0; i < windowHeights.length && cells.length < MAX_CELLS; i += step) {
    const h = windowHeights[i];
    cells.push({ height: h, miss: missedSet.has(h) });
  }

  const sampledNote = windowHeights.length < total;

  return (
    <div className="card uptime flush-top">
      <div className="meta">
        <div className={`pct${good ? ' good' : ''}`}>{pct.toFixed(1)}%</div>
        <div className="sm">
          Produced <b style={{ color: 'var(--text-primary)' }}>{formatNumber(produced)}</b> of last{' '}
          {formatNumber(total)} blocks · <b style={{ color: 'var(--coral)' }}>{formatNumber(missed)} missed</b>
          <br />
          Window from block {formatNumber(uptime.fromHeight)} → {formatNumber(uptime.toHeight)}
          {sampledNote ? ' · showing most recent 200' : ''}
        </div>
      </div>
      <div className="blocks">
        {cells.map((c) => (
          <div key={c.height} className={`blk${c.miss ? ' miss' : ''}`} title={`Block ${formatNumber(c.height)} · ${c.miss ? 'missed' : 'produced'}`} />
        ))}
      </div>
      <div className="legend">
        <span>
          <i style={{ background: 'var(--mint)' }} /> Produced
        </span>
        <span>
          <i style={{ background: 'var(--coral)' }} /> Missed
        </span>
      </div>
    </div>
  );
}
