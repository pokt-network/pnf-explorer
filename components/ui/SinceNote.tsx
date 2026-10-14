import type { Coverage } from '@/lib/data/range';
import { NOT_COVERED_HINT } from '@/lib/data/window';
import { absoluteUtc } from '@/lib/time';

/**
 * The quiet line under a lifetime figure from the settlement catalog: where its data starts, where it
 * ends when that lags behind now (a 0 or a missing row past it is "not covered yet"), and any stretch
 * inside it with nothing indexed. Says so when nothing is covered at all.
 */
export function SinceNote({ c }: { c: Coverage }) {
  if (c.notCovered) {
    return (
      <div className="muted" style={{ marginTop: 4 }}>
        {NOT_COVERED_HINT}
      </div>
    );
  }
  if (c.dataSince == null) return null;
  const gaps = c.gaps.map((g) => `${absoluteUtc(g.from)} – ${absoluteUtc(g.to)}`).join(', ');
  return (
    <div className="muted" style={{ marginTop: 4 }}>
      Settlements since {absoluteUtc(c.dataSince)}
      {c.dataUntil != null ? ` until ${absoluteUtc(c.dataUntil)} (newer ones not indexed yet)` : ''}
      {gaps ? ` · not indexed: ${gaps}` : ''}
    </div>
  );
}
