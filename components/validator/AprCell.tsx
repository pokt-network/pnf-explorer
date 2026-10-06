import { getValidatorDelegatorAprMap } from '@/lib/data/validators';
import { NOT_COVERED } from '@/lib/data/range';
import { INACTIVE, INACTIVE_HINT, NOT_COVERED_HINT, STILL_PROCESSING, STILL_PROCESSING_HINT, STOPPED_HINT } from '@/lib/data/window';
import type { NetworkId } from '@/lib/networks';

/**
 * One validator's cell in the list's APR column. Streamed behind its own Suspense boundary so the list
 * renders without waiting for the APR roll-up; every cell awaits the same `cache()`-deduped map, so
 * the page still makes one roll-up per request. A validator missing from the map (or a failed
 * roll-up) has no rate, which renders as a dash rather than 0%.
 */
export async function AprCell({ network, valoper }: { network: NetworkId; valoper: string }) {
  const map = await getValidatorDelegatorAprMap(network);
  if (map === NOT_COVERED) {
    return (
      <span className="dim" title={NOT_COVERED_HINT}>
        —
      </span>
    );
  }
  const apr = map.get(valoper);
  if (!apr) return <span className="dim">—</span>;
  // The catalog covered only part of the window: say on how many days of data the cell rests.
  const covered = apr.coverageNote ? (
    <span className="dim" title={`Based on ${apr.coveredDays.toFixed(1)} days of data. ${apr.coverageNote}`}>
      *
    </span>
  ) : null;
  if (apr.aprPct == null) {
    return (
      <>
        <span className="dim" title={apr.inactive ? INACTIVE_HINT : STILL_PROCESSING_HINT}>
          {apr.inactive ? INACTIVE : STILL_PROCESSING}
        </span>
        {covered}
      </>
    );
  }
  return (
    <span title={apr.inactive ? STOPPED_HINT : apr.partialWindow ? `Settled for only part of the ${Math.round(apr.coveredDays)}-day window.` : undefined}>
      {apr.aprPct.toFixed(2)}%{apr.partialWindow ? <span className="dim">†</span> : null}
      {covered}
    </span>
  );
}
