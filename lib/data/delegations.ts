import { cache } from 'react';
import { gqlFetch } from '@/lib/graphql';
import { lcdFetch } from '@/lib/lcd';
import type { NetworkId } from '@/lib/networks';
import { UPOKT_PER_POKT } from '@/lib/config';
import { toBigInt } from '@/lib/format';
import { toDate } from '@/lib/time';
import { DELEGATION_PAYOUTS, DELEGATION_EARNINGS, DELEGATION_WINDOW_BLOCK } from '@/lib/queries/delegations';

// Staking-delegation data layer.
//
// Two sources, deliberately split (see lib/queries/delegations.ts for the full rationale):
//   - LCD → the delegations themselves + pending (accrued, unpaid) rewards. Not indexed at all.
//   - GQL → realised payouts: exact, per settlement that credited this address.
//
// The two are NOT the same money. A validator's settlement credits its delegator pool every
// session (~20 blocks); the pool is swept to delegator accounts irregularly, a few times a day.
// "Earned" therefore means RECEIVED and "Pending" means accrued-but-not-yet-swept. Summing them
// would double-count the sweep that is about to happen, so this module never combines them and
// the UI keeps them in separate columns.

/** Trailing window for the daily average and APR. Long enough to smooth the irregular sweeps. */
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
  total?: { denom?: string; amount?: string }[];
}

/** One validator this address has staked POKT with. `pendingUpokt` is accrued, not yet received. */
export interface DelegationRow {
  validatorAddress: string;
  /** Bonded upokt (the `balance`, not the share count — shares drift from tokens after a slash). */
  amountUpokt: string;
  pendingUpokt: string;
}

export interface DelegationSet {
  rows: DelegationRow[];
  /** Total bonded across every delegation, upokt. */
  totalUpokt: string;
  /** Total accrued-but-unpaid across every delegation, upokt. */
  pendingUpokt: string;
  /** True when the LCD reported more delegations than it returned in one page. */
  truncated: boolean;
}

// The LCD caps a page at 100 by default; ask for more explicitly so a large delegator set arrives
// in one call, and report truncation rather than silently showing a partial total.
const DELEGATION_PAGE = 500;

/**
 * Delegations + pending rewards for an address, always-LCD (§2 — the indexer has no Delegation
 * entity). Returns null when the address delegates to nobody, which is what gates the whole role.
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

  // Pending rewards are a separate endpoint; a failure there must not cost us the delegation list.
  let rewards: LcdRewardsResponse = {};
  try {
    rewards = await lcdFetch<LcdRewardsResponse>(network, `/cosmos/distribution/v1beta1/delegators/${address}/rewards`, {
      revalidate: 30,
    });
  } catch {
    /* pending renders as zero */
  }
  const pendingBy = new Map<string, string>();
  for (const r of rewards.rewards ?? []) {
    const upokt = r.reward?.find((x) => x.denom === 'upokt')?.amount;
    if (r.validator_address && upokt) pendingBy.set(r.validator_address, upokt);
  }

  const rows: DelegationRow[] = [];
  let total = BigInt(0);
  let pending = BigInt(0);
  for (const d of responses) {
    const validatorAddress = d.delegation?.validator_address;
    if (!validatorAddress) continue;
    const amountUpokt = d.balance?.denom === 'upokt' ? (d.balance.amount ?? '0') : '0';
    // Reward amounts are DECIMAL strings ("664143124.680255000000000000"); toBigInt keeps the
    // integer upokt part, which is the only part that can ever actually be paid out.
    const pendingUpokt = toBigInt(pendingBy.get(validatorAddress)).toString();
    rows.push({ validatorAddress, amountUpokt, pendingUpokt });
    total += toBigInt(amountUpokt);
    pending += toBigInt(pendingUpokt);
  }
  if (rows.length === 0) return null;

  rows.sort((a, b) => (toBigInt(b.amountUpokt) > toBigInt(a.amountUpokt) ? 1 : -1));
  const reported = Number(res.pagination?.total ?? rows.length);
  return {
    rows,
    totalUpokt: total.toString(),
    pendingUpokt: pending.toString(),
    truncated: Number.isFinite(reported) && reported > rows.length,
  };
});

// ---- realised payouts ----
export interface PayoutRow {
  id: string;
  amountUpokt: string;
  blockHeight: string;
  timestamp: string | null;
}

/** One page of realised payouts, newest first, plus the lifetime count/sum for the panel header. */
export async function getDelegationPayouts(
  network: NetworkId,
  address: string,
  limit: number,
  offset: number,
): Promise<{ totalCount: number; lifetimeUpokt: string; rows: PayoutRow[] }> {
  const d = await gqlFetch<{
    modToAcctTransfers: {
      totalCount: number;
      aggregates: { sum: { amount: string | null } | null } | null;
      nodes: { id: string; amount: string; blockId: string; block: { id: string; timestamp: string } | null }[];
    } | null;
  }>(network, DELEGATION_PAYOUTS, { address, limit, offset }, { revalidate: 60 });

  const c = d.modToAcctTransfers;
  return {
    totalCount: c?.totalCount ?? 0,
    lifetimeUpokt: c?.aggregates?.sum?.amount ?? '0',
    rows: (c?.nodes ?? []).map((n) => ({
      id: n.id,
      amountUpokt: n.amount,
      blockHeight: n.block?.id ?? n.blockId,
      timestamp: n.block?.timestamp ?? null,
    })),
  };
}

export interface DelegationEarnings {
  /** Everything this address has ever been paid, upokt. */
  lifetimeUpokt: string;
  lifetimePayouts: number;
  /** Payouts inside the trailing window, upokt. */
  windowUpokt: string;
  windowPayouts: number;
  /** Days actually covered — clamped by the first payout for a delegation younger than the window. */
  windowDays: number;
  /** Mean upokt received per day across the window. */
  dailyAvgUpokt: number;
  /**
   * Annualised window return over the CURRENT bonded stake, as a percentage. Null when nothing is
   * bonded. An estimate by construction — see the caveats on the view.
   */
  aprPct: number | null;
  /** Timestamp of the first payout ever received, for "earning since". */
  firstPayoutAt: string | null;
}

/**
 * Resolve the window's starting block from a real block timestamp. Deriving it from an assumed 60s
 * block time would bake a multi-day error into the APR as soon as block time drifts.
 */
async function windowStartBlock(network: NetworkId, days: number): Promise<{ height: string; timestamp: string } | null> {
  const cutoff = new Date(Date.now() - days * 86_400_000);
  // Indexer timestamps are UTC-naive ("2026-07-30T17:59:36.047"), so send the cutoff the same way.
  const iso = cutoff.toISOString().replace('Z', '');
  try {
    const d = await gqlFetch<{ blocks: { nodes: { id: string; timestamp: string }[] } }>(
      network,
      DELEGATION_WINDOW_BLOCK,
      { cutoff: iso },
      { revalidate: 300 },
    );
    const n = d.blocks.nodes[0];
    return n ? { height: n.id, timestamp: n.timestamp } : null;
  } catch {
    return null;
  }
}

/**
 * Lifetime + trailing-window earnings, the daily average and the derived APR.
 *
 * APR is `window payouts / days × 365 / bonded stake`. Two caveats, both surfaced in the UI: it is
 * backward-looking (past settlement volume, not a promised rate), and it divides by the stake as it
 * stands NOW — a delegation resized inside the window skews it.
 */
export async function getDelegationEarnings(
  network: NetworkId,
  address: string,
  bondedUpokt: string,
  days = EARNINGS_WINDOW_DAYS,
): Promise<DelegationEarnings | null> {
  const start = await windowStartBlock(network, days);
  if (!start) return null;

  let d: {
    lifetime: { totalCount: number; aggregates: { sum: { amount: string | null } | null } | null } | null;
    window: { totalCount: number; aggregates: { sum: { amount: string | null } | null } | null } | null;
    first: { nodes: { blockId: string; block: { timestamp: string } | null }[] } | null;
  };
  try {
    d = await gqlFetch(network, DELEGATION_EARNINGS, { address, windowStartBlock: start.height }, { revalidate: 60 });
  } catch {
    return null;
  }

  const lifetimeUpokt = d.lifetime?.aggregates?.sum?.amount ?? '0';
  const windowUpokt = d.window?.aggregates?.sum?.amount ?? '0';
  const firstPayoutAt = d.first?.nodes?.[0]?.block?.timestamp ?? null;

  // A delegation younger than the window earned over less time than the window is long; dividing by
  // the full 30 days would understate it. Clamp the divisor to the real earning period.
  const startedAt = toDate(start.timestamp)?.getTime() ?? null;
  const firstAt = toDate(firstPayoutAt)?.getTime() ?? null;
  const from = firstAt != null && startedAt != null ? Math.max(startedAt, firstAt) : (startedAt ?? firstAt);
  const windowDays = from != null ? Math.max((Date.now() - from) / 86_400_000, 1 / 24) : days;

  const dailyAvgUpokt = Number(toBigInt(windowUpokt)) / windowDays;
  const bonded = Number(toBigInt(bondedUpokt));
  const aprPct = bonded > 0 ? ((dailyAvgUpokt * 365) / bonded) * 100 : null;

  return {
    lifetimeUpokt,
    lifetimePayouts: d.lifetime?.totalCount ?? 0,
    windowUpokt,
    windowPayouts: d.window?.totalCount ?? 0,
    windowDays,
    dailyAvgUpokt,
    aprPct,
    firstPayoutAt,
  };
}

/** Daily average as whole POKT, for the summary card. */
export function dailyAvgPokt(e: DelegationEarnings): number {
  return e.dailyAvgUpokt / UPOKT_PER_POKT;
}
