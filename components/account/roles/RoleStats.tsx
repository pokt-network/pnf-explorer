import { NetLink as Link } from '@/components/shell/NetLink';
import { SummaryCard, DOT } from '@/components/ui/SummaryCard';
import { formatNumber } from '@/lib/format';
import { etaFromBlocks } from '@/lib/time';

/**
 * The role's summary box: one full-width panel hanging off the role tabs, not a row of separate
 * cards. 4-up on desktop, 2-up under 820px, divided by hairlines rather than gaps.
 */
export function RoleStats({ children }: { children: React.ReactNode }) {
  return <div className="card rolebox statsbox">{children}</div>;
}

/**
 * Same box, two panels: a lead stat on the left and its explainer on the right. For roles whose
 * whole quantitative story is a single number (rev-share income, service owner), where a lone stat
 * card floating above an explainer card reads as two orphans.
 */
export function RoleSplit({ children }: { children: React.ReactNode }) {
  return <div className="card rolebox splitbox lead">{children}</div>;
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
