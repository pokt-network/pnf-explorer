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
import { getDelegationPayouts, dailyAvgPokt, EARNINGS_WINDOW_DAYS } from '@/lib/data/delegations';
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

/**
 * Validators tab — where the stake actually sits. Always-LCD: the indexer has no Delegation
 * entity, so the bonded amount and the accrued-but-unpaid reward both come straight from the
 * chain. Validator identity (moniker, commission, status) is enriched from the indexer, which is
 * cosmetic — a failure there leaves the row rendering the raw valoper.
 */
async function ValidatorsPanel({ network, set }: { network: NetworkId; set: DelegationSet }) {
  // Monikers/commission for the delegated validators. The set is small (35 validators network-wide)
  // so one list call is cheaper than N by-id lookups.
  const meta = new Map<string, { moniker: string | null; commission: unknown; stakeStatus: string | null }>();
  try {
    const list = await getValidatorList(network, 200, 0);
    for (const v of list.nodes) {
      meta.set(v.id, { moniker: validatorMoniker(v.description), commission: v.commission, stakeStatus: v.stakeStatus });
    }
  } catch {
    /* rows fall back to the bare valoper */
  }

  return (
    <div className="card flush-top">
      <LcdSourceStrip>
        Staking delegations are not served by the GraphQL indexer. The bonded amount and the pending reward on each row are read
        live from the chain.
      </LcdSourceStrip>
      <div className="tbl-scroll">
        <table className="tbl">
          <thead>
            <tr>
              <th>Validator</th>
              <th>Status</th>
              <th className="num">Commission</th>
              <th className="num">Delegated</th>
              <th className="num">Pending reward</th>
            </tr>
          </thead>
          <tbody>
            {set.rows.map((r) => {
              const m = meta.get(r.validatorAddress);
              return (
                <tr key={r.validatorAddress}>
                  <td>
                    <Link href={`/validator/${r.validatorAddress}`}>{m?.moniker ?? truncate(r.validatorAddress, 12, 6)}</Link>
                    {m?.moniker ? <div className="dim mono" style={{ fontSize: 12 }}>{truncate(r.validatorAddress, 12, 6)}</div> : null}
                  </td>
                  <td>{m?.stakeStatus ? <StakeStatusPill status={m.stakeStatus} sm /> : <span className="dim">—</span>}</td>
                  <td className="num mono">{m?.commission ? formatCommission(m.commission) : '—'}</td>
                  <td className="num mono">{formatPokt(r.amountUpokt)}</td>
                  <td className="num mono">{formatPokt(r.pendingUpokt)}</td>
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
                This address delegates to more validators than one LCD page returns; the totals above cover the{' '}
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
 * Payouts tab — the realised money, block by block.
 *
 * These are the settlements that actually credited POKT to this address (module→account transfers
 * with opReason TLM_RELAY_BURN_EQUALS_MINT_DELEGATOR_RD), not a pro-rata estimate of what the
 * validators earned. The chain does not record WHICH delegated validator a given payout came from,
 * so the stream is deliberately not split per validator — see the note under the table.
 */
async function PayoutsPanel({
  network,
  address,
  page,
  validatorCount,
}: {
  network: NetworkId;
  address: string;
  page: number;
  validatorCount: number;
}) {
  let data: Awaited<ReturnType<typeof getDelegationPayouts>>;
  try {
    data = await getDelegationPayouts(network, address, LIMIT, (page - 1) * LIMIT);
  } catch {
    return (
      <div className="card flush-top">
        <EmptyState>Couldn’t load delegation payouts right now.</EmptyState>
      </div>
    );
  }
  if (data.rows.length === 0 && page === 1) {
    return (
      <div className="card flush-top">
        <EmptyState>
          This address has staking delegations but has not been paid a delegation reward yet. Rewards accrue every session and are
          swept to the account periodically.
        </EmptyState>
      </div>
    );
  }

  return (
    <div className="card flush-top">
      <div className="kv" style={{ paddingTop: 0 }}>
        <div className="line">
          <div className="k">Received</div>
          <div className="v">
            <b>{formatPokt(data.lifetimeUpokt)} POKT</b>{' '}
            <span className="dim">
              across {formatNumber(data.totalCount)} payout{data.totalCount === 1 ? '' : 's'}
            </span>
            <div className="muted" style={{ marginTop: 4 }}>
              Each row is a settlement that credited POKT to this address. The chain records the payout but not which of the{' '}
              {formatNumber(validatorCount)} delegated validator{validatorCount === 1 ? '' : 's'} it came from, so the stream is
              combined.
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
              <th className="num">Amount</th>
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
                <td className="num mono">{formatPokt(r.amountUpokt, 6)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data.totalCount > LIMIT ? <Pager page={page} pageSize={LIMIT} totalCount={data.totalCount} param="payouts" /> : null}
    </div>
  );
}

/** Rate tab — how the daily average and the APR on the summary row were actually derived. */
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
              · {formatNumber(earnings.windowPayouts)} payout{earnings.windowPayouts === 1 ? '' : 's'} ·{' '}
              {formatPokt(earnings.windowUpokt)} POKT
            </span>
            {earnings.windowDays < EARNINGS_WINDOW_DAYS - 0.5 ? (
              <div className="muted" style={{ marginTop: 4 }}>
                Shorter than the standard {EARNINGS_WINDOW_DAYS}-day window because this address has only been earning since{' '}
                {earnings.firstPayoutAt ? absoluteUtc(earnings.firstPayoutAt) : 'recently'}.
              </div>
            ) : null}
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
              Daily average annualised over the {formatPokt(set.totalUpokt)} POKT currently bonded. Backward-looking: it reflects
              the settlement volume this address’s validators actually earned in the window, not a promised or forward rate. A
              delegation that changed size inside the window skews it, because the divisor is today’s stake.
            </div>
          </div>
        </div>
        <div className="line">
          <div className="k">Lifetime</div>
          <div className="v">
            <b>{formatPokt(earnings.lifetimeUpokt)} POKT</b>{' '}
            <span className="dim">
              across {formatNumber(earnings.lifetimePayouts)} payout{earnings.lifetimePayouts === 1 ? '' : 's'}
            </span>
            {earnings.firstPayoutAt ? (
              <div className="muted" style={{ marginTop: 4 }}>
                First payout {relativeTime(earnings.firstPayoutAt)} · {absoluteUtc(earnings.firstPayoutAt)}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * The staking-delegator actor: POKT bonded to validators, and what that stake has actually been
 * paid. Distinct from every other role on an address page in that its subject is the chain's
 * staking module, not one of Pocket's own actor modules.
 */
export function DelegationRoleView({
  network,
  address,
  set,
  earnings,
  payoutsPage,
}: {
  network: NetworkId;
  address: string;
  set: DelegationSet;
  earnings: DelegationEarnings | null;
  payoutsPage: string | undefined;
}) {
  const tabs: TabDef[] = [
    {
      key: 'validators',
      label: 'Validators',
      badge: set.rows.length || undefined,
      panel: <ValidatorsPanel network={network} set={set} />,
    },
    {
      key: 'payouts',
      label: 'Payouts',
      badge: earnings?.lifetimePayouts || undefined,
      panel: (
        <PayoutsPanel network={network} address={address} page={parsePage(payoutsPage)} validatorCount={set.rows.length} />
      ),
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

  const win = earnings ? windowLabel(earnings.windowDays) : `${EARNINGS_WINDOW_DAYS}d`;

  return (
    <>
      <RoleStats>
        <SummaryCard label="Delegated" dot={DOT.lavender} value={formatPoktCompact(set.totalUpokt)} unit="POKT" />
        <SummaryCard label="Earned" dot={DOT.mint} value={earnings ? formatPoktCompact(earnings.lifetimeUpokt) : '—'} unit="POKT" />
        <SummaryCard
          label={`Daily Avg ${win}`}
          dot={DOT.blue}
          value={earnings ? statPokt(dailyAvgPokt(earnings)) : '—'}
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
          <div className="k">Pending reward</div>
          <div className="v">
            <b>{formatPokt(set.pendingUpokt)} POKT</b>
            <div className="muted" style={{ marginTop: 4 }}>
              Accrued but not yet swept to the account. Validators credit their delegator pool at every session end; the pool
              lands in delegator accounts periodically. Not included in <b>Earned</b>, which counts only POKT actually received.
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
