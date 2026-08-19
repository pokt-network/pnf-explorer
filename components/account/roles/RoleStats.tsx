import { NetLink as Link } from '@/components/shell/NetLink';
import { SummaryCard, DOT } from '@/components/ui/SummaryCard';
import { formatNumber } from '@/lib/format';
import { etaFromBlocks } from '@/lib/time';

/** Stat row above a role's tabs. 4-up on desktop, matching the list pages' summary row. */
export function RoleStats({ children }: { children: React.ReactNode }) {
  return <div className="sumrow">{children}</div>;
}

export { SummaryCard, DOT };

/**
 * Unbond banner for an actor in the Unstaking state. Supplier/app/gateway all expose the exact
 * unbond block via `unstakingEndHeight`; the wall-clock is an ESTIMATE from block height and is
 * labelled as such (~).
 */
export function UnbondBanner({
  endHeight,
  currentHeight,
  reason,
}: {
  endHeight: string | null;
  currentHeight: number | null;
  reason?: string | null;
}) {
  if (!endHeight) return null;
  const end = Number(endHeight);
  const remaining = currentHeight != null ? end - currentHeight : null;
  return (
    <div className="card kv" style={{ paddingTop: 0, marginBottom: 14 }}>
      <div className="ttl">Unbonding</div>
      <div className="line">
        <div className="k">Unbonds at block</div>
        <div className="v">
          <Link href={`/block/${end}`}>{formatNumber(end)}</Link>
          {remaining != null ? <span className="dim"> · {etaFromBlocks(remaining)}</span> : null}
          {reason ? <span className="dim"> · {reason}</span> : null}
        </div>
      </div>
    </div>
  );
}
