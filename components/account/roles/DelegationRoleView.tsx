import { NetLink as Link } from '@/components/shell/NetLink';
import { Hash } from '@/components/ui/Hash';
import { Tabs } from '@/components/ui/Tabs';
import type { TabDef } from '@/components/ui/Tabs';
import { Pager } from '@/components/ui/Pager';
import { RawJson } from '@/components/ui/RawJson';
import { LcdSourceStrip } from '@/components/ui/LcdSourceStrip';
import { EmptyState } from '@/components/ui/states';
import { StakeStatusPill } from '@/components/ui/StatusPill';
import { RoleStats, SummaryCard, DOT } from './RoleStats';
import { getDelegationSettlements, toPokt, EARNINGS_WINDOW_DAYS } from '@/lib/data/delegations';
import type { DelegationSet, DelegationEarnings } from '@/lib/data/delegations';
import { getValidatorList } from '@/lib/data/validators';
import type { NetworkId } from '@/lib/networks';
import { formatNumber, formatPokt, formatPoktCompact, formatCompact, truncate } from '@/lib/format';
import { relativeTime, absoluteUtc } from '@/lib/time';
import { validatorMoniker, formatCommission } from '@/lib/validator';
import { parsePage } from '@/lib/paging';

const LIMIT = 25;

/**
 * POKT for a stat card. Compact past a thousand, two decimals below it — a 4.89 POKT/day average
 * must not render as "5", which is what plain compact notation does to small values.
 */
function statPokt(pokt: number): string {
  return pokt >= 1000 ? formatCompact(pokt) : pokt.toFixed(2);
}

/** Round a window in days to something a label can say without implying false precision. */
function windowLabel(days: number): string {
  if (days >= 1.5) return `${Math.round(days)}d`;
  return `${Math.max(1, Math.round(days * 24))}h`;
}

/** Validator monikers/commission/status, keyed by valoper. Cosmetic — failure leaves bare addresses. */
async function validatorMeta(network: NetworkId) {
  const meta = new Map<string, { moniker: string | null; commission: unknown; stakeStatus: string | null }>();
  try {
    // The set is small (tens of validators network-wide), so one list call beats N by-id lookups.
    const list = await getValidatorList(network, 200, 0);
    for (const v of list.nodes) {
      meta.set(v.id, { moniker: validatorMoniker(v.description), commission: v.commission, stakeStatus: v.stakeStatus });
    }
  } catch {
    /* rows fall back to the bare valoper */
  }
  return meta;
}

/**
 * Validators tab — where the stake sits and what each validator returned over the window.
 *
 * Bonded amount and claimable balance are always-LCD; the per-validator earnings column is derived
 * from that validator's settlements (see lib/queries/delegations.ts).
 */
async function ValidatorsPanel({
  network,
  set,
  earnings,
}: {
  network: NetworkId;
  set: DelegationSet;
  earnings: DelegationEarnings | null;
}) {
  const meta = await validatorMeta(network);
  const earnBy = new Map((earnings?.byValidator ?? []).map((v) => [v.validatorAddress, v]));
  const win = earnings ? windowLabel(earnings.windowDays) : `${EARNINGS_WINDOW_DAYS}d`;

  return (
    <div className="card flush-top">
      <LcdSourceStrip>
        The bonded amount and the claimable balance are read live from the chain — staking delegations are not served by the
        GraphQL indexer. Earnings are derived from each validator’s settlement events.
      </LcdSourceStrip>
      <div className="tbl-scroll">
        <table className="tbl">
          <thead>
            <tr>
              <th>Validator</th>
              <th>Status</th>
              <th className="num">Commission</th>
              <th className="num">Delegated</th>
              <th className="num">Earned {win}</th>
              <th className="num">Claimable</th>
            </tr>
          </thead>
          <tbody>
            {set.rows.map((r) => {
              const m = meta.get(r.validatorAddress);
              const e = earnBy.get(r.validatorAddress);
              return (
                <tr key={r.validatorAddress}>
                  <td>
                    <Link href={`/validator/${r.validatorAddress}`}>{m?.moniker ?? truncate(r.validatorAddress, 12, 6)}</Link>
                    {m?.moniker ? (
                      <div className="dim mono" style={{ fontSize: 12 }}>
                        {truncate(r.validatorAddress, 12, 6)}
                      </div>
                    ) : null}
                  </td>
                  <td>{m?.stakeStatus ? <StakeStatusPill status={m.stakeStatus} sm /> : <span className="dim">—</span>}</td>
                  <td className="num mono">{m?.commission ? formatCommission(m.commission) : '—'}</td>
                  <td className="num mono">{formatPokt(r.amountUpokt)}</td>
                  <td className="num mono">
                    {e ? formatPokt(Math.round(e.myShareUpokt)) : <span className="dim">—</span>}
                    {e ? (
                      <div className="dim" style={{ fontSize: 12 }}>
                        {formatNumber(e.settlements)} settlements
                      </div>
                    ) : null}
                  </td>
                  <td className="num mono">{formatPokt(r.claimableUpokt)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {set.truncated ? (
        <div className="kv">
          <div className="line">
            <div className="k">Note</div>
            <div className="v">
              <span className="muted">
                This address delegates to more validators than one LCD page returns; the totals cover the{' '}
                {formatNumber(set.rows.length)} shown.
              </span>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Settlements tab — the blocks where the delegated validators earned, and this address's cut.
 *
 * Each row is one validator's session-end settlement. Shannon pays the delegator pool's share
 * straight to delegator wallets, so a row is income landing, not an accrual waiting to be claimed.
 */
async function SettlementsPanel({
  network,
  set,
  earnings,
  page,
}: {
  network: NetworkId;
  set: DelegationSet;
  earnings: DelegationEarnings | null;
  page: number;
}) {
  let data: Awaited<ReturnType<typeof getDelegationSettlements>>;
  try {
    data = await getDelegationSettlements(network, set, LIMIT, (page - 1) * LIMIT);
  } catch {
    return (
      <div className="card flush-top">
        <EmptyState>Couldn’t load settlements right now.</EmptyState>
      </div>
    );
  }
  if (data.rows.length === 0 && page === 1) {
    return (
      <div className="card flush-top">
        <EmptyState>These validators have not settled a reward yet.</EmptyState>
      </div>
    );
  }

  const meta = await validatorMeta(network);
  const win = earnings ? windowLabel(earnings.windowDays) : `${EARNINGS_WINDOW_DAYS}d`;

  return (
    <div className="card flush-top">
      <div className="kv" style={{ paddingTop: 0 }}>
        <div className="line">
          <div className="k">Earned {win}</div>
          <div className="v">
            {earnings ? (
              <>
                <b>{formatPokt(Math.round(earnings.windowUpokt))} POKT</b>{' '}
                <span className="dim">
                  across {formatNumber(earnings.settlements)} settlement{earnings.settlements === 1 ? '' : 's'}
                </span>
              </>
            ) : (
              <span className="dim">—</span>
            )}
            <div className="muted" style={{ marginTop: 4 }}>
              Each row is one validator’s session-end settlement. Shannon pays the delegator pool’s share directly to delegator
              wallets, so this is money that landed — there is nothing to claim. <b>My share</b> is this address’s pro-rata slice
              of the pool: pool × (bonded stake ÷ total delegated stake).
            </div>
          </div>
        </div>
      </div>
      <div className="tbl-scroll">
        <table className="tbl">
          <thead>
            <tr>
              <th>Block</th>
              <th>Age</th>
              <th>Validator</th>
              <th className="num">Delegator pool</th>
              <th className="num">Pool stake</th>
              <th className="num">My share</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((r) => (
              <tr key={r.id}>
                <td>
                  <Link href={`/block/${r.blockHeight}`}>{formatNumber(r.blockHeight)}</Link>
                </td>
                <td title={r.timestamp ? absoluteUtc(r.timestamp) : undefined}>
                  {r.timestamp ? relativeTime(r.timestamp) : <span className="dim">—</span>}
                </td>
                <td>
                  <Link href={`/validator/${r.validatorAddress}`}>
                    {meta.get(r.validatorAddress)?.moniker ?? truncate(r.validatorAddress, 10, 5)}
                  </Link>
                </td>
                <td className="num mono">{formatPokt(r.poolUpokt, 4)}</td>
                <td className="num mono">
                  {formatPoktCompact(r.totalStakeUpokt)}
                  <span className="dim"> · {formatNumber(r.numDelegators)}</span>
                </td>
                <td className="num mono">{formatPokt(Math.round(r.myShareUpokt), 4)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data.totalCount > LIMIT ? <Pager page={page} pageSize={LIMIT} totalCount={data.totalCount} param="settlements" /> : null}
    </div>
  );
}

/** Rate tab — how the daily average and the APR on the summary row were derived, and what limits them. */
function RatePanel({ set, earnings }: { set: DelegationSet; earnings: DelegationEarnings | null }) {
  if (!earnings) {
    return (
      <div className="card flush-top">
        <EmptyState>Couldn’t compute the earnings rate right now.</EmptyState>
      </div>
    );
  }
  const win = windowLabel(earnings.windowDays);
  return (
    <div className="card flush-top">
      <div className="kv" style={{ paddingTop: 0 }}>
        <div className="line">
          <div className="k">Window</div>
          <div className="v">
            Trailing <b>{win}</b>{' '}
            <span className="dim">
              · {formatNumber(earnings.settlements)} settlement{earnings.settlements === 1 ? '' : 's'} ·{' '}
              {formatPokt(Math.round(earnings.windowUpokt))} POKT
            </span>
          </div>
        </div>
        <div className="line">
          <div className="k">Daily average</div>
          <div className="v">
            <b>{formatPokt(Math.round(earnings.dailyAvgUpokt))} POKT</b> <span className="dim">per day</span>
          </div>
        </div>
        <div className="line">
          <div className="k">APR</div>
          <div className="v">
            {earnings.aprPct != null ? <b>{earnings.aprPct.toFixed(2)}%</b> : <span className="dim">—</span>}
            <div className="muted" style={{ marginTop: 4 }}>
              Daily average annualised over the {formatPokt(set.totalUpokt)} POKT bonded. Backward-looking: it reflects the
              settlement volume these validators actually earned in the window, not a promised or forward rate.
            </div>
          </div>
        </div>
        <div className="line">
          <div className="k">How it’s derived</div>
          <div className="v">
            Shannon pays the validator pool’s share of relay settlement directly to delegator wallets at each session end. This
            address’s income is its slice of that pool: <b>pool × (bonded stake ÷ total delegated stake)</b>, summed over the
            window.
            <div className="muted" style={{ marginTop: 4 }}>
              The slice uses the stake bonded <i>today</i>. Cosmos staking messages are not indexed, so a delegation that changed
              size inside the window cannot be corrected for and would skew both the daily average and the APR.
              {earnings.approximate
                ? ' A validator’s total delegated stake also moved during this window, so its share is a mean rather than an exact figure.'
                : ' Every validator’s total delegated stake held steady across this window, so the slice is exact.'}
            </div>
          </div>
        </div>
        <div className="line">
          <div className="k">Claimable</div>
          <div className="v">
            <b>{formatPokt(set.claimableUpokt)} POKT</b>
            <div className="muted" style={{ marginTop: 4 }}>
              Separate money, and deliberately excluded from every figure above. This is the Cosmos distribution pool fed by the
              protocol’s minimum inflation, which cannot be set to zero. Settlement income never passes through it.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * The staking-delegator actor: POKT bonded to validators, and what that stake actually earns.
 * Distinct from every other role on an address page in that its subject is the chain's staking and
 * distribution modules, not one of Pocket's own actor modules.
 */
export function DelegationRoleView({
  network,
  address,
  set,
  earnings,
  settlementsPage,
}: {
  network: NetworkId;
  address: string;
  set: DelegationSet;
  earnings: DelegationEarnings | null;
  settlementsPage: string | undefined;
}) {
  const win = earnings ? windowLabel(earnings.windowDays) : `${EARNINGS_WINDOW_DAYS}d`;

  const tabs: TabDef[] = [
    {
      key: 'validators',
      label: 'Validators',
      badge: set.rows.length || undefined,
      panel: <ValidatorsPanel network={network} set={set} earnings={earnings} />,
    },
    {
      key: 'settlements',
      label: 'Settlements',
      panel: <SettlementsPanel network={network} set={set} earnings={earnings} page={parsePage(settlementsPage)} />,
    },
    { key: 'rate', label: 'Rate', panel: <RatePanel set={set} earnings={earnings} /> },
    {
      key: 'raw',
      label: 'Raw',
      panel: (
        <div className="card flush-top">
          <LcdSourceStrip>The staking module’s own delegation records for this address, read live from the chain.</LcdSourceStrip>
          <RawJson title="Raw Delegations" source={<>Cosmos LCD · staking + distribution modules</>} data={set.rows} />
        </div>
      ),
    },
  ];

  return (
    <>
      <RoleStats>
        <SummaryCard label="Delegated" dot={DOT.lavender} value={formatPoktCompact(set.totalUpokt)} unit="POKT" />
        <SummaryCard
          label={`Earned ${win}`}
          dot={DOT.mint}
          value={earnings ? statPokt(toPokt(earnings.windowUpokt)) : '—'}
          unit="POKT"
        />
        <SummaryCard
          label={`Daily Avg ${win}`}
          dot={DOT.blue}
          value={earnings ? statPokt(toPokt(earnings.dailyAvgUpokt)) : '—'}
          unit="POKT"
        />
        <SummaryCard
          label={`APR ${win}`}
          dot={DOT.gold}
          value={earnings?.aprPct != null ? `${earnings.aprPct.toFixed(2)}%` : '—'}
        />
      </RoleStats>

      <div className="card kv" style={{ paddingTop: 0 }}>
        <div className="ttl">Staking Delegator</div>
        <div className="line">
          <div className="k">Bonded to</div>
          <div className="v">
            <b>{formatNumber(set.rows.length)}</b> validator{set.rows.length === 1 ? '' : 's'}{' '}
            <span className="dim">· {formatPokt(set.totalUpokt)} POKT</span>
            <div className="muted" style={{ marginTop: 4 }}>
              Consensus stake delegated through the Cosmos staking module. Separate from any POKT this address has staked as a
              Pocket actor — a supplier, application or gateway stake is not a delegation.
            </div>
          </div>
        </div>
        <div className="line">
          <div className="k">Rewards</div>
          <div className="v">
            Paid <b>directly to this wallet</b> at each session end
            <div className="muted" style={{ marginTop: 4 }}>
              The validator pool’s share of relay settlement is distributed straight to delegators — there is no claim step and
              nothing accrues waiting for one. See the Settlements tab for the per-block detail.
            </div>
          </div>
        </div>
        <div className="line">
          <div className="k">Claimable</div>
          <div className="v">
            <b>{formatPokt(set.claimableUpokt)} POKT</b> <span className="dim">· minimum inflation only</span>
            <div className="muted" style={{ marginTop: 4 }}>
              Not settlement income. Cosmos cannot set emissions to zero, so a trivial amount accrues in the distribution pool
              and sits here until claimed. Excluded from Earned, the daily average and the APR.
            </div>
          </div>
        </div>
        <div className="line">
          <div className="k">Delegator</div>
          <div className="v">
            <Hash value={address} />
          </div>
        </div>
      </div>

      <Tabs tabs={tabs} />
    </>
  );
}
