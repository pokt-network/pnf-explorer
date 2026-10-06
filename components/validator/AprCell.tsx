import { getValidatorDelegatorAprMap, APR_WINDOW_DAYS } from '@/lib/data/validators';
import { NOT_COVERED } from '@/lib/data/range';
import { INACTIVE, inactiveHint, NOT_COVERED_HINT, STILL_PROCESSING, stillProcessingHint, STOPPED_HINT, windowLabel } from '@/lib/data/window';
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
  // The catalog covered only part of the window: say how much of it the cell was read over.
  const covered = map.coverageNote ? (
    <span className="dim" title={`Read over the window's ${map.coveredDays.toFixed(1)} days of indexed data. ${map.coverageNote}`}>
      ‡
    </span>
  ) : null;
  const apr = map.byValoper.get(valoper);
  if (!apr) {
    return (
      <>
        <span className="dim">—</span>
        {covered}
      </>
    );
  }
  if (apr.aprPct == null) {
    return (
      <>
        <span
          className="dim"
          title={apr.inactive ? inactiveHint(APR_WINDOW_DAYS, map.coveredDays) : stillProcessingHint(APR_WINDOW_DAYS, map.coveredDays)}
        >
          {apr.inactive ? INACTIVE : STILL_PROCESSING}
        </span>
        {covered}
      </>
    );
  }
  return (
    <span title={apr.inactive ? STOPPED_HINT : apr.partialWindow ? `Settled for only part of the ${windowLabel(map.coveredDays)} window.` : undefined}>
      {apr.aprPct.toFixed(2)}%{apr.partialWindow ? <span className="dim">†</span> : null}
      {covered}
    </span>
  );
}

/**
 * The list footnote's word on coverage, from the same cached roll-up as the cells: what the ‡ marks
 * when the catalog covers only part of the window, and why every rate is a dash when it covers none.
 * Nothing when the window is fully covered.
 */
export async function AprCoverageFootnote({ network }: { network: NetworkId }) {
  const map = await getValidatorDelegatorAprMap(network);
  if (map === NOT_COVERED) return <> {NOT_COVERED_HINT} The dashes say nothing about the validators&rsquo; settlements.</>;
  if (!map.coverageNote) return null;
  return (
    <>
      {' '}
      <span className="dim">‡</span> marks a cell read over only {windowLabel(map.coveredDays)} of indexed data ({map.coverageNote}).
    </>
  );
}
