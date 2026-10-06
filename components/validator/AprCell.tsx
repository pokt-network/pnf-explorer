import { getValidatorDelegatorAprMap, APR_WINDOW_DAYS } from '@/lib/data/validators';
import { INACTIVE, INACTIVE_HINT, STILL_PROCESSING, STILL_PROCESSING_HINT, STOPPED_HINT } from '@/lib/data/window';
import type { NetworkId } from '@/lib/networks';
import { coverageNote } from '@/lib/data/range';

/**
 * One validator's cell in the list's APR column. Streamed behind its own Suspense boundary so the list
 * renders without waiting for the APR roll-up; every cell awaits the same `cache()`-deduped map, so
 * the page still makes one roll-up per request. A validator missing from the map (or a failed
 * roll-up) has no rate, which renders as a dash rather than 0%.
 */
export async function AprCell({ network, valoper }: { network: NetworkId; valoper: string }) {
  const apr = (await getValidatorDelegatorAprMap(network)).get(valoper);
  if (!apr) return <span className="dim">—</span>;
  if (apr.aprPct == null) {
    return (
      <span className="dim" title={apr.inactive ? INACTIVE_HINT : STILL_PROCESSING_HINT}>
        {apr.inactive ? INACTIVE : STILL_PROCESSING}
      </span>
    );
  }
  const note = coverageNote(apr.coverage);
  return (
    <span title={apr.inactive ? STOPPED_HINT : apr.partialWindow ? `Settled for only part of the ${APR_WINDOW_DAYS}-day window.` : undefined}>
      {apr.aprPct.toFixed(2)}%{apr.partialWindow ? <span className="dim">†</span> : null}
      {note ? (
        <span className="dim" title={`Based on ${apr.coveredDays.toFixed(1)} days of data. ${note}`}>
          *
        </span>
      ) : null}
    </span>
  );
}
