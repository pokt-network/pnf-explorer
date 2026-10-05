import { cache } from 'react';
import { gqlFetch } from '@/lib/graphql';
import { lcdFetch } from '@/lib/lcd';
import type { NetworkId } from '@/lib/networks';
import { UPOKT_PER_POKT } from '@/lib/config';
import { toBigInt } from '@/lib/format';
import { DELEGATION_FIRST_HOUR, DELEGATION_SETTLEMENTS, DELEGATION_WINDOW, WINDOW_START_BLOCK } from '@/lib/queries/delegations';
import { MIN_SPAN_DAYS, trailingRange } from '@/lib/data/window';

// Staking-delegation data layer. See lib/queries/delegations.ts for the verified model; the short
// version is that Shannon pays the validator pool's settlement share DIRECTLY to delegator wallets
// each session, and a delegator's income is its pro-rata slice of `delegatorsRewardAmount`. The
// separately-claimable LCD balance is the Cosmos minimum-inflation pool and is NOT that income.
//
//   - LCD → the delegations, and the claimable minimum-inflation balance.
//   - GQL → eventValidatorRewardDistributions for the per-settlement list (derived share), and the
//     money catalog for the window's exact income.

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

/** Budget for the start-of-window delegation check: the page awaits it, so a hung LCD must not stall it. */
const DELEGATED_AT_TIMEOUT_MS = 3000;

/**
 * Whether the address held any delegation at `atMs`: the chain's own record (historical LCD read at
 * the block of that time), since the indexer exposes no delegations. `atMs` should sit on a stable
 * boundary (the caller passes the hour), so the block and the LCD read are cached for an hour rather
 * than once per minute. Null — unknown — when either read fails or times out (LCD down, or the
 * height pruned: HTTP 500 "version does not exist").
 */
async function delegatedAt(network: NetworkId, address: string, atMs: number): Promise<boolean | null> {
  const signal = AbortSignal.timeout(DELEGATED_AT_TIMEOUT_MS);
  try {
    const b = await gqlFetch<{ blocks: { nodes: { id: string }[] } }>(
      network,
      WINDOW_START_BLOCK,
      // Indexer timestamps are UTC-naive, so the cutoff goes without the trailing Z.
      { cutoff: new Date(atMs).toISOString().replace('Z', '') },
      { revalidate: 3600, signal },
    );
    const height = b.blocks.nodes[0]?.id;
    if (!height) return null;
    const res = await lcdFetch<LcdDelegationResponse>(network, `/cosmos/staking/v1beta1/delegations/${address}?pagination.limit=1`, {
      revalidate: 3600,
      height,
      signal,
    });
    return (res.delegation_responses ?? []).length > 0;
  } catch {
    return null;
  }
}

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
  /** What this address received from it, upokt. */
  myShareUpokt: number;
  /** True when the address no longer delegates to this validator (it paid inside the window). */
  former: boolean;
}

export interface DelegationEarnings {
  /** Income received over the window, upokt. */
  windowUpokt: number;
  /** Settlements counted. */
  settlements: number;
  /** Days the window actually covers. */
  windowDays: number;
  /** Days the address has been delegating inside the window: the whole window when it already held a
   *  delegation at its start, otherwise from its first payment. */
  activeDays: number;
  /** Income per active day. Null when `startUnknown`. */
  dailyAvgUpokt: number | null;
  /** Annualised income over the current bonded stake, percent. Null when nothing is bonded, when
   *  `stillProcessing` or when `startUnknown`. */
  aprPct: number | null;
  /** True when the address was first paid after the window started and the chain could not say whether
   *  it was already delegating then: the span, and with it any rate, is unknown. */
  startUnknown: boolean;
  /** True when the address has been paid for under MIN_SPAN_DAYS: too little data for an APR. */
  stillProcessing: boolean;
  byValidator: ValidatorEarning[];
}

/**
 * Trailing-window income, daily average and APR, in one round trip to the money catalog (see
 * DELEGATION_WINDOW). The income is exact, including from validators the address has since left.
 *
 * APR is backward-looking: it annualises what the window paid over the stake bonded NOW, not a
 * promised rate.
 */
export async function getDelegationEarnings(
  network: NetworkId,
  address: string,
  set: DelegationSet,
  days = EARNINGS_WINDOW_DAYS,
): Promise<DelegationEarnings | null> {
  const current = new Set(set.rows.map((r) => r.validatorAddress));
  const range = trailingRange(days, 60);
  // In parallel with the catalog read below; checked at the hour the window starts in.
  const bondedAtStart = delegatedAt(network, address, Math.floor(Date.parse(range.rangeStart) / 3_600_000) * 3_600_000);
  let d: {
    income: { bucket_start: string; validator_operator: string; amount_upokt: string | null }[] | null;
    pools: { validator_operator: string; delegators_upokt: string | null; distributions: string | null }[] | null;
  };
  try {
    d = await gqlFetch(network, DELEGATION_WINDOW, { delegators: [address], ...range }, { revalidate: 60 });
  } catch {
    return null;
  }

  // Day rows per validator: sum them, and note the first day the address was paid.
  const mineBy = new Map<string, number>();
  let windowUpokt = 0;
  let firstDay = Infinity;
  for (const r of d.income ?? []) {
    const amount = Number(r.amount_upokt ?? 0);
    windowUpokt += amount;
    if (amount > 0) firstDay = Math.min(firstDay, Date.parse(r.bucket_start));
    if (r.validator_operator) mineBy.set(r.validator_operator, (mineBy.get(r.validator_operator) ?? 0) + amount);
  }

  const poolBy = new Map((d.pools ?? []).map((p) => [p.validator_operator, p]));
  const byValidator: ValidatorEarning[] = [];
  for (const [validatorAddress, myShareUpokt] of mineBy) {
    const pool = poolBy.get(validatorAddress);
    byValidator.push({
      validatorAddress,
      settlements: Number(pool?.distributions ?? 0),
      poolUpokt: Number(pool?.delegators_upokt ?? 0),
      myShareUpokt,
      former: !current.has(validatorAddress),
    });
  }

  // The active span is the whole window when the address already held a delegation at its start
  // (whether or not its validators paid early on). Otherwise it began delegating inside the window,
  // and the span starts at the hour of its first payment (re-read by hour over that day) — later
  // than the delegation itself only if its validator paid nothing at first. When the check failed,
  // a first payment in the window's first hour still means it was delegating from the start; a later
  // one leaves the span unknown, and no rate is shown rather than a wrong one.
  const from = Date.parse(range.rangeStart);
  const to = Date.parse(range.rangeEnd);
  const bondedAt = await bondedAtStart;
  let firstAt = from;
  let startUnknown = false;
  if (bondedAt !== true && Number.isFinite(firstDay)) {
    firstAt = Math.max(firstDay, from);
    try {
      const h = await gqlFetch<{ getDelegatorIncomeJson: { bucket_start: string; amount_upokt: string | null }[] | null }>(
        network,
        DELEGATION_FIRST_HOUR,
        { delegators: [address], rangeStart: new Date(firstAt).toISOString(), rangeEnd: new Date(Math.min(firstDay + 86_400_000, to)).toISOString() },
        { revalidate: 60 },
      );
      const hours = (h.getDelegatorIncomeJson ?? []).filter((r) => Number(r.amount_upokt ?? 0) > 0).map((r) => Date.parse(r.bucket_start));
      if (hours.length > 0) firstAt = Math.max(Math.min(...hours), from);
    } catch {
      /* keep the day's start */
    }
    if (bondedAt === null) {
      if (firstAt > from + 3_600_000) startUnknown = true;
      else firstAt = from;
    }
  }
  const activeDays = (to - firstAt) / 86_400_000;
  // Settlements of every validator the window covers: the current ones and those that paid.
  const counted = new Set([...current, ...byValidator.map((v) => v.validatorAddress)]);
  const settlements = [...counted].reduce((n, v) => n + Number(poolBy.get(v)?.distributions ?? 0), 0);

  const windowDays = days;
  const dailyAvgUpokt = startUnknown ? null : activeDays > 0 ? windowUpokt / activeDays : 0;
  const bonded = Number(toBigInt(set.totalUpokt));
  const stillProcessing = !startUnknown && activeDays < MIN_SPAN_DAYS;
  const aprPct = bonded > 0 && dailyAvgUpokt != null && !stillProcessing ? ((dailyAvgUpokt * 365) / bonded) * 100 : null;

  byValidator.sort((a, b) => b.myShareUpokt - a.myShareUpokt);
  return {
    windowUpokt,
    settlements,
    windowDays,
    activeDays,
    dailyAvgUpokt,
    aprPct,
    stillProcessing,
    startUnknown,
    byValidator,
  };
}

/** upokt → POKT, for the summary cards. */
export function toPokt(upokt: number): number {
  return upokt / UPOKT_PER_POKT;
}
