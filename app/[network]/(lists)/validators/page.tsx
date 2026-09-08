import type { Metadata } from 'next';
import { NetLink as Link } from '@/components/shell/NetLink';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { Tic } from '@/components/ui/Icons';
import { Pager } from '@/components/ui/Pager';
import { ValidatorStatePill } from '@/components/ui/StatusPill';
import { EmptyState } from '@/components/ui/states';
import {
  getValidatorList,
  getValidatorChainStates,
  getValidatorDelegatorAprMap,
  APR_WINDOW_DAYS,
} from '@/lib/data/validators';
import type { NetworkId } from '@/lib/networks';
import { formatNumber, formatPokt, truncate } from '@/lib/format';
import { formatCommission, validatorMoniker, deriveValidatorState } from '@/lib/validator';
import { sumUpokt } from '@/lib/tx';

export const metadata: Metadata = { title: 'Validators' };

// ~35 validators total — fetch enough to compute an honest network share in one page.
const FETCH_LIMIT = 100;
const PAGE_SIZE = 25;

export default async function ValidatorsPage({
  params,
  searchParams,
}: {
  params: Promise<{ network: NetworkId }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { network } = await params;
  const { page: pageParam } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);

  const [{ nodes, totalCount }, chain, aprByValidator] = await Promise.all([
    getValidatorList(network, FETCH_LIMIT, 0),
    // Active-set standing + tokens in one LCD read. The indexer's stakeStatus cannot tell a
    // below-the-cutoff candidate from a jailed validator — both are "Unstaked" there.
    getValidatorChainStates(network),
    // One grouped roll-up for the whole set — see getValidatorDelegatorAprMap. A validator missing
    // from the map has no rate, which renders as a dash rather than 0%.
    getValidatorDelegatorAprMap(network),
  ]);

  // Voting power is total bonded `tokens` (self-stake + delegations) from the LCD — the security
  // weight — NOT the indexer's `stakeAmount` (operator self-stake only). Fall back per-row to
  // stakeAmount when the LCD map is empty/missing a validator.
  const votingPowerOf = (v: (typeof nodes)[number]) =>
    chain.byValoper.get(v.id)?.tokens ?? v.stakeAmount ?? '0';

  // Share denominator is the ACTIVE set only, matching the chain's own `bonded_tokens` pool.
  // Summing every validator instead folds in stake held by non-bonded ones, inflating the
  // denominator and understating every real share. Falls back to the all-rows sum if the LCD failed.
  const totalStakeNum = chain.ok
    ? Number(chain.bondedTotalUpokt)
    : Number(sumUpokt(nodes.map((v) => ({ denom: v.stakeDenom ?? 'upokt', amount: votingPowerOf(v) }))));

  // Rank by voting power (bonded tokens) descending so the "#" column is meaningful. BigInt
  // compare keeps large upokt amounts exact. All validators are fetched before paging, so the
  // rank is stable across pages.
  const toUpoktInt = (v: string) => BigInt(String(v).split('.')[0] || '0');
  const ranked = [...nodes].sort((a, b) => {
    const d = toUpoktInt(votingPowerOf(b)) - toUpoktInt(votingPowerOf(a));
    return d > 0n ? 1 : d < 0n ? -1 : 0;
  });

  const offset = (page - 1) * PAGE_SIZE;
  const pageRows = ranked.slice(offset, offset + PAGE_SIZE);
  const from = totalCount === 0 ? 0 : offset + 1;
  const to = Math.min(offset + PAGE_SIZE, ranked.length);

  return (
    <>
      <Breadcrumb items={[{ label: 'Home', href: '/' }, { label: 'Validators' }]} />
      <div className="listhead">
        <Tic entity="validator" iconSize={20} />
        <h1>Validators</h1>
        <span className="cnt">
          Showing {formatNumber(from)}–{formatNumber(to)} of {formatNumber(totalCount)}
        </span>
      </div>

      <div className="card">
        <div className="tbl-scroll">
          <table className="tbl">
            <thead>
              <tr>
                <th className="rank">#</th>
                <th>Validator</th>
                <th>Status</th>
                <th className="num">Voting Power</th>
                <th className="num">Share</th>
                <th className="num">Commission</th>
                <th className="num">Est. APR*</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((v, i) => {
                const rank = offset + i + 1;
                const moniker = validatorMoniker(v.description) ?? truncate(v.id, 10, 6);
                const votingPower = votingPowerOf(v);
                const stakeNum = Number(sumUpokt([{ denom: v.stakeDenom ?? 'upokt', amount: votingPower }]));
                const state = deriveValidatorState(chain.byValoper.get(v.id), chain.ok);
                // Only the active set has consensus weight; a share for anyone else would imply
                // voting influence they do not have.
                const hasShare = state === 'active' || state === 'unknown';
                const sharePct = hasShare && totalStakeNum > 0 ? (stakeNum / totalStakeNum) * 100 : 0;
                const apr = aprByValidator.get(v.id);
                return (
                  <tr key={v.id}>
                    <td className="rank">{rank}</td>
                    <td>
                      <Link href={`/validator/${v.id}`}>{moniker}</Link>
                      <br />
                      <span className="mono dim" style={{ fontSize: 11 }}>
                        {truncate(v.id, 14, 4)}
                      </span>
                    </td>
                    <td>
                      <ValidatorStatePill
                        state={state}
                        fallbackStatus={v.stakeStatus}
                        maxValidators={chain.maxValidators}
                        sm
                      />
                    </td>
                    <td className="num mono">{formatPokt(votingPower)} POKT</td>
                    <td className="num dim">
                      {hasShare ? (
                        <>
                          {sharePct.toFixed(1)}%
                          <span className="bar-mini">
                            <i style={{ width: `${Math.min(100, sharePct)}%` }} />
                          </span>
                        </>
                      ) : (
                        <span className="dim">—</span>
                      )}
                    </td>
                    <td className="num">{formatCommission(v.commission)}</td>
                    {/* Net delegator return over the trailing window — already after this
                        validator's commission. Matches the figure on its detail page. */}
                    <td className="num mono">
                      {apr ? (
                        <span
                          title={
                            apr.partialWindow ? `Settled for only part of the ${APR_WINDOW_DAYS}-day window.` : undefined
                          }
                        >
                          {apr.aprPct.toFixed(2)}%{apr.partialWindow ? <span className="dim">†</span> : null}
                        </span>
                      ) : (
                        <span className="dim">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {pageRows.length === 0 ? (
          <EmptyState>No validators found.</EmptyState>
        ) : (
          <>
            <p className="tbl-note">
              Only the <b>Active</b> set{chain.maxValidators ? ` — the top ${chain.maxValidators} validators by stake — ` : ' '}
              signs blocks and earns rewards, so Share is shown for those alone. <b>Inactive</b> validators are staked
              below that cutoff with their delegations intact, which is not the same as having unstaked.
              <br />* Est. APR is the net return paid to delegators over the trailing {APR_WINDOW_DAYS}-day window, after
              the validator&rsquo;s commission, annualised. It is a historic estimate that moves with network demand
              &mdash; not a promised rate, and not an indicator of future performance. A dash means the validator had
              too little settlement in the window to derive a rate{'; '}
              <span className="dim">&dagger;</span> marks one that was only settling for part of it.
            </p>
            <Pager page={page} pageSize={PAGE_SIZE} totalCount={totalCount} />
          </>
        )}
      </div>
    </>
  );
}
