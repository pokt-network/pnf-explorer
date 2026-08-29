import { cache } from 'react';
import { gqlFetch } from '@/lib/graphql';
import { lcdFetch } from '@/lib/lcd';
import type { NetworkId } from '@/lib/networks';
import { UPOKT_PER_POKT } from '@/lib/config';
import { toBigInt } from '@/lib/format';
import { toDate } from '@/lib/time';
import { DELEGATION_SETTLEMENTS, DELEGATION_WINDOW } from '@/lib/queries/delegations';
import { resolveWindowStart } from '@/lib/data/window';

// Staking-delegation data layer. See lib/queries/delegations.ts for the verified model; the short
// version is that Shannon pays the validator pool's settlement share DIRECTLY to delegator wallets
// each session, and a delegator's income is its pro-rata slice of `delegatorsRewardAmount`. The
// separately-claimable LCD balance is the Cosmos minimum-inflation pool and is NOT that income.
//
//   - LCD → the delegations, and the claimable minimum-inflation balance.
//   - GQL → eventValidatorRewardDistributions, from which income is derived per session.

/** Trailing window for earned/daily-average/APR. Long enough to smooth per-session variance. */
export const EARNINGS_WINDOW_DAYS = 30;

// ---- LCD shapes ----
interface LcdDelegationResponse {
  delegation_responses?: {
    delegation?: { delegator_address?: string; validator_address?: string; shares?: string };
    balance?: { denom?: string; amount?: string };
  }[];
  pagination?: { total?: string | null };
}

interface LcdRewardsResponse {
  rewards?: { validator_address?: string; reward?: { denom?: string; amount?: string }[] }[];
}

/** One validator this address has staked POKT with. */
export interface DelegationRow {
  validatorAddress: string;
  /** Bonded upokt (the `balance`, not the share count — shares drift from tokens after a slash). */
  amountUpokt: string;
  /**
   * Claimable from the Cosmos distribution module, upokt. This is the minimum-inflation pool — the
   * protocol cannot set emissions to zero, so a trivial amount accrues here. It is NOT withheld
   * settlement income; that is paid straight to the wallet and never appears in this balance.
   */
  claimableUpokt: string;
}

export interface DelegationSet {
  rows: DelegationRow[];
  /** Total bonded across every delegation, upokt. */
  totalUpokt: string;
  /** Total claimable minimum-inflation balance across every delegation, upokt. */
  claimableUpokt: string;
  /** True when the LCD reported more delegations than it returned in one page. */
  truncated: boolean;
}

// The LCD caps a page at 100 by default; ask for more explicitly so a large delegation set arrives
// in one call, and report truncation rather than silently showing a partial total.
const DELEGATION_PAGE = 500;

/**
 * Delegations + the claimable balance for an address, always-LCD (§2 — the indexer has no
 * Delegation entity and does not index Cosmos staking messages either). Returns null when the
 * address delegates to nobody, which is what gates the whole role.
 *
 * `cache()`-deduped: the address page calls this once to decide whether the role is held and again
 * to render it.
 */
export const getDelegations = cache(async (network: NetworkId, address: string): Promise<DelegationSet | null> => {
  let res: LcdDelegationResponse;
  try {
    res = await lcdFetch<LcdDelegationResponse>(
      network,
      `/cosmos/staking/v1beta1/delegations/${address}?pagination.limit=${DELEGATION_PAGE}`,
      { revalidate: 30 },
    );
  } catch {
    // 404 = never delegated; any other failure is indistinguishable here and also yields "no role".
    return null;
  }

  const responses = res.delegation_responses ?? [];
  if (responses.length === 0) return null;

  // The claimable balance is a separate endpoint; a failure there must not cost us the delegations.
  let rewards: LcdRewardsResponse = {};
  try {
    rewards = await lcdFetch<LcdRewardsResponse>(network, `/cosmos/distribution/v1beta1/delegators/${address}/rewards`, {
      revalidate: 30,
    });
  } catch {
    /* claimable renders as zero */
  }
  const claimableBy = new Map<string, string>();
  for (const r of rewards.rewards ?? []) {
    const upokt = r.reward?.find((x) => x.denom === 'upokt')?.amount;
    if (r.validator_address && upokt) claimableBy.set(r.validator_address, upokt);
  }

  const rows: DelegationRow[] = [];
  let total = BigInt(0);
  let claimable = BigInt(0);
  for (const d of responses) {
    const validatorAddress = d.delegation?.validator_address;
    if (!validatorAddress) continue;
    const amountUpokt = d.balance?.denom === 'upokt' ? (d.balance.amount ?? '0') : '0';
    // Claimable comes back as a DECIMAL string ("664143124.680255000000000000"); toBigInt keeps the
    // integer upokt part, which is the only part that can ever actually be claimed.
    const claimableUpokt = toBigInt(claimableBy.get(validatorAddress)).toString();
    rows.push({ validatorAddress, amountUpokt, claimableUpokt });
    total += toBigInt(amountUpokt);
    claimable += toBigInt(claimableUpokt);
  }
  if (rows.length === 0) return null;

  rows.sort((a, b) => (toBigInt(b.amountUpokt) > toBigInt(a.amountUpokt) ? 1 : -1));
  const reported = Number(res.pagination?.total ?? rows.length);
  return {
    rows,
    totalUpokt: total.toString(),
    claimableUpokt: claimable.toString(),
    truncated: Number.isFinite(reported) && reported > rows.length,
  };
});

// ---- derived income ----

/** Pro-rata slice of a pool. Returns 0 rather than NaN when the pool's stake is missing/zero. */
function slice(poolUpokt: number, myStakeUpokt: number, totalStakeUpokt: number): number {
  if (!(totalStakeUpokt > 0)) return 0;
  return poolUpokt * (myStakeUpokt / totalStakeUpokt);
}

/** One settlement, with this address's derived share of it. */
export interface SettlementRow {
  id: string;
  blockHeight: string;
  sessionEndHeight: string;
  validatorAddress: string;
  timestamp: string | null;
  /** The whole delegator pool's cut of this settlement, upokt. */
  poolUpokt: string;
  /** Stake the pool was divided over at this block, upokt. */
  totalStakeUpokt: string;
  numDelegators: number;
  /** This address's derived slice, upokt. */
  myShareUpokt: number;
}

/**
 * One page of settlements across every delegated validator, newest first, each carrying this
 * address's derived slice.
 *
 * The slice uses the address's CURRENT bonded stake against the pool's historical
 * `totalDelegatedStakeAmount`. Cosmos staking messages are not indexed, so there is no way to
 * recover what this address had bonded at an arbitrary past block — rows from before a delegation
 * changed size are therefore approximate, and the view says so.
 */
export async function getDelegationSettlements(
  network: NetworkId,
  set: DelegationSet,
  limit: number,
  offset: number,
): Promise<{ totalCount: number; rows: SettlementRow[] }> {
  const validators = set.rows.map((r) => r.validatorAddress);
  const stakeBy = new Map(set.rows.map((r) => [r.validatorAddress, Number(toBigInt(r.amountUpokt))]));

  const d = await gqlFetch<{
    eventValidatorRewardDistributions: {
      totalCount: number;
      nodes: {
        id: string;
        blockId: string;
        sessionEndBlockHeight: string;
        validatorOperatorAddress: string;
        delegatorsRewardAmount: string;
        totalDelegatedStakeAmount: string;
        numDelegators: number;
        block: { id: string; timestamp: string } | null;
      }[];
    } | null;
  }>(network, DELEGATION_SETTLEMENTS, { validators, limit, offset }, { revalidate: 60 });

  const c = d.eventValidatorRewardDistributions;
  return {
    totalCount: c?.totalCount ?? 0,
    rows: (c?.nodes ?? []).map((n) => ({
      id: n.id,
      blockHeight: n.block?.id ?? n.blockId,
      sessionEndHeight: n.sessionEndBlockHeight,
      validatorAddress: n.validatorOperatorAddress,
      timestamp: n.block?.timestamp ?? null,
      poolUpokt: n.delegatorsRewardAmount,
      totalStakeUpokt: n.totalDelegatedStakeAmount,
      numDelegators: n.numDelegators,
      myShareUpokt: slice(
        Number(toBigInt(n.delegatorsRewardAmount)),
        stakeBy.get(n.validatorOperatorAddress) ?? 0,
        Number(toBigInt(n.totalDelegatedStakeAmount)),
      ),
    })),
  };
}

/** Per-validator contribution to the window total. */
export interface ValidatorEarning {
  validatorAddress: string;
  settlements: number;
  /** The validator's whole delegator pool over the window, upokt. */
  poolUpokt: number;
  /** This address's derived slice of it, upokt. */
  myShareUpokt: number;
  /** True when the pool's total staked amount moved during the window (slice is then a mean). */
  poolDrifted: boolean;
}

export interface DelegationEarnings {
  /** Derived income over the window, upokt. */
  windowUpokt: number;
  /** Settlements counted. */
  settlements: number;
  /** Days the window actually covers. */
  windowDays: number;
  dailyAvgUpokt: number;
  /** Annualised window income over the current bonded stake, percent. Null when nothing is bonded. */
  aprPct: number | null;
  byValidator: ValidatorEarning[];
  /** True when any validator's pool moved during the window — the totals are then approximate. */
  approximate: boolean;
}

/**
 * Trailing-window income, daily average and APR, derived per validator in one round trip.
 *
 * Two caveats, both surfaced on the view: APR is backward-looking (it annualises the settlement
 * volume this address's validators actually earned in the window, not a promised rate), and the
 * slice divides by the stake as it stands NOW because historical delegation sizes are not
 * recoverable from the indexer.
 */
export async function getDelegationEarnings(
  network: NetworkId,
  set: DelegationSet,
  days = EARNINGS_WINDOW_DAYS,
): Promise<DelegationEarnings | null> {
  const start = await resolveWindowStart(network, days);
  if (!start) return null;

  const validators = set.rows.map((r) => r.validatorAddress);
  let d: {
    eventValidatorRewardDistributions: {
      totalCount: number;
      byValidator: {
        keys: string[] | null;
        sum: { delegatorsRewardAmount: string | null } | null;
        average: { totalDelegatedStakeAmount: string | null } | null;
        min: { totalDelegatedStakeAmount: string | null } | null;
        max: { totalDelegatedStakeAmount: string | null } | null;
        distinctCount: { id: string | null } | null;
      }[] | null;
    } | null;
  };
  try {
    d = await gqlFetch(network, DELEGATION_WINDOW, { validators, windowStartBlock: start.height }, { revalidate: 60 });
  } catch {
    return null;
  }

  const stakeBy = new Map(set.rows.map((r) => [r.validatorAddress, Number(toBigInt(r.amountUpokt))]));
  const byValidator: ValidatorEarning[] = [];
  let windowUpokt = 0;

  for (const g of d.eventValidatorRewardDistributions?.byValidator ?? []) {
    const validatorAddress = g.keys?.[0];
    if (!validatorAddress) continue;
    const pool = Number(g.sum?.delegatorsRewardAmount ?? 0);
    // The average is the right divisor for a summed pool: sum(pool) / mean(stake) is the mean slice
    // weighted by nothing, which is exact while the stake holds still and a fair estimate when it
    // does not. min !== max is the tell that it did not.
    const avgStake = Number(g.average?.totalDelegatedStakeAmount ?? 0);
    const myShareUpokt = slice(pool, stakeBy.get(validatorAddress) ?? 0, avgStake);
    byValidator.push({
      validatorAddress,
      settlements: Number(g.distinctCount?.id ?? 0),
      poolUpokt: pool,
      myShareUpokt,
      poolDrifted: (g.min?.totalDelegatedStakeAmount ?? null) !== (g.max?.totalDelegatedStakeAmount ?? null),
    });
    windowUpokt += myShareUpokt;
  }

  // The window can only cover as much history as the chain has; clamp so a young chain or a thin
  // window never inflates the daily average by dividing by days that were not actually observed.
  const startedAt = toDate(start.timestamp)?.getTime() ?? null;
  const windowDays = startedAt != null ? Math.max((Date.now() - startedAt) / 86_400_000, 1 / 24) : days;

  const dailyAvgUpokt = windowUpokt / windowDays;
  const bonded = Number(toBigInt(set.totalUpokt));
  const aprPct = bonded > 0 ? ((dailyAvgUpokt * 365) / bonded) * 100 : null;

  byValidator.sort((a, b) => b.myShareUpokt - a.myShareUpokt);
  return {
    windowUpokt,
    settlements: d.eventValidatorRewardDistributions?.totalCount ?? 0,
    windowDays,
    dailyAvgUpokt,
    aprPct,
    byValidator,
    approximate: byValidator.some((v) => v.poolDrifted),
  };
}

/** upokt → POKT, for the summary cards. */
export function toPokt(upokt: number): number {
  return upokt / UPOKT_PER_POKT;
}
