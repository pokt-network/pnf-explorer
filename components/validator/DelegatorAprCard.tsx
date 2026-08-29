import { getValidatorDelegatorApr, APR_WINDOW_DAYS } from '@/lib/data/validators';
import { Skeleton } from '@/components/ui/states';
import type { NetworkId } from '@/lib/networks';
import { formatPokt, formatNumber } from '@/lib/format';
import { formatCommission } from '@/lib/validator';

/**
 * Net delegator return for a validator, over a trailing window.
 *
 * "Net" is the load-bearing word. `delegatorsRewardAmount` is what the chain hands delegators AFTER
 * the operator's commission is taken — verified on a 9%-commission validator, where it is exactly
 * 91.00% of the pool on every sampled settlement. Subtracting commission here would double-count it
 * and understate the delegator's return by the commission rate, which is the obvious mistake to
 * make when reading "the validator charges 9%".
 *
 * Streamed behind its own Suspense boundary: it is a ~2s indexer aggregate against a page that
 * otherwise renders in well under a second, and this indexer's latency is not stable.
 */
export async function DelegatorAprCard({
  network,
  valoper,
  commission,
}: {
  network: NetworkId;
  valoper: string;
  commission: unknown;
}) {
  const apr = await getValidatorDelegatorApr(network, valoper).catch(() => null);

  if (!apr) {
    return (
      <AprShell>
        <div className="big">
          —<span className="u"> %</span>
        </div>
        <div className="upokt">no settlements in the window</div>
      </AprShell>
    );
  }

  return (
    <AprShell>
      <div className="big">
        {apr.aprPct.toFixed(2)}
        <span className="u"> %</span>
      </div>
      <div className="upokt">net of {formatCommission(commission)} commission</div>
      <div className="upd">
        {formatPokt(apr.delegatorUpokt)} POKT to delegators
        <span className="dim"> · {formatNumber(apr.settlements)} settlements</span>
        {apr.partialWindow ? (
          <div className="dim">Covers {apr.activeDays.toFixed(1)}d — this validator did not settle for the whole window.</div>
        ) : null}
        {apr.stakeDrifted ? <div className="dim">Bonded stake moved during the window, so this is an average.</div> : null}
      </div>
    </AprShell>
  );
}

/** Shared frame so the skeleton and the resolved card are the same shape — no layout shift. */
function AprShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="card balance">
      <div className="lbl">Delegator APR ({APR_WINDOW_DAYS}d avg)</div>
      {children}
    </div>
  );
}

export function DelegatorAprSkeleton() {
  return (
    <AprShell>
      <div className="big">
        <Skeleton width={120} height={30} />
      </div>
      <div className="upokt">
        <Skeleton width={170} height={13} />
      </div>
      <div className="upd">
        <Skeleton width={210} height={13} />
      </div>
    </AprShell>
  );
}
