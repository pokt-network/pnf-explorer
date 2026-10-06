import { cache } from 'react';
import { gqlFetch } from '@/lib/graphql';
import { lcdFetch } from '@/lib/lcd';
import { getMetadata } from '@/lib/metadata';
import type { NetworkId } from '@/lib/networks';
import { validatorMoniker } from '@/lib/validator';
import {
  VALIDATORS_LIST,
  VALIDATOR_BY_ID,
  VALIDATOR_UPTIME,
  VALIDATOR_REWARDS,
} from '@/lib/queries/validators';
import { trailingRange, MIN_SPAN_DAYS } from '@/lib/data/window';
import { toBigInt } from '@/lib/format';
import { NOT_COVERED, coverageNote, coveredMs, coveredWindow, unwrapRange, type CoveredRange, type CoveredWindow } from '@/lib/data/range';

// Validator data layer. commission + description are JSON OBJECTS (parse via lib/validator).
// stakeStatus is the StakeStatus enum (Staked/Unstaking/Unstaked) — NOT Bonded/Unbonding.
// Probed live (2026-06-05): 35 validators total; signerId/id are valoper bech32; `ed25519Id`
// is the hex consensus address used for uptime; minSelfDelegation is a upokt amount; produced/
// missedBlocks come back as arrays of block-height numbers.

const UPTIME_WINDOW = 2000;

// The uptime query needs the validator's hex consensus address. VALIDATOR_BY_ID (verbatim,
// per the pre-authored constants) does not select it, so we read just `ed25519Id` here.
const VALIDATOR_HEX_ADDRESS = /* GraphQL */ `
  query validatorHexAddress($id: String!) {
    validator(id: $id) {
      id
      ed25519Id
    }
  }
`;

export interface ValidatorRow {
  id: string;
  signerId: string;
  description: unknown;
  commission: unknown;
  minSelfDelegation: number | string | null;
  stakeDenom: string | null;
  stakeAmount: string | null;
  stakeStatus: string | null;
  signer?: { id: string } | null;
}

export interface ValidatorBalance {
  amount: string;
  denom: string;
}

export interface ValidatorDetail extends ValidatorRow {
  // The pokt1 operator account (signerId is the valoper; signer.balances is empty). This is the
  // address to use for the signer link, balance, and tx/transfer tab filters.
  signerPoktPrefixId?: string | null;
  signerPoktPrefix?: { id: string; balances?: { nodes: ValidatorBalance[] } } | null;
}

export interface UptimeResult {
  /** Block heights produced by the validator in the window. */
  produced: number[];
  /** Block heights missed by the validator in the window. */
  missed: number[];
  fromHeight: number;
  toHeight: number;
}

export interface DelegationRow {
  delegatorAddress: string;
  shares: string;
  amount: string;
}

// ---- proposer resolution ----
// A block's `proposerAddress` is the Tendermint consensus address = a validator's `ed25519Id`,
// NOT a bech32 account. Map it to the validator so proposer links resolve correctly.
const VALIDATOR_CONSENSUS_MAP = /* GraphQL */ `
  query validatorConsensusMap {
    validators(first: 200) {
      nodes {
        id
        ed25519Id
        description
      }
    }
  }
`;

export interface ProposerValidator {
  id: string;
  moniker: string | null;
}

/**
 * hex consensus address (uppercased `ed25519Id`) → validator. `cache()`-deduped within a render
 * (so a 10-row block list does ONE fetch) and ISR-cached 300s (the set rarely changes). Returns
 * an empty map on failure → proposer falls back to plain hex.
 */
export const getConsensusValidatorMap = cache(async (network: NetworkId): Promise<Map<string, ProposerValidator>> => {
  const map = new Map<string, ProposerValidator>();
  try {
    const data = await gqlFetch<{ validators: { nodes: { id: string; ed25519Id: string | null; description: unknown }[] } }>(
      network,
      VALIDATOR_CONSENSUS_MAP,
      undefined,
      { revalidate: 300 },
    );
    for (const v of data.validators.nodes) {
      if (v.ed25519Id) map.set(v.ed25519Id.toUpperCase(), { id: v.id, moniker: validatorMoniker(v.description) });
    }
  } catch {
    /* empty map → proposer renders as plain consensus hex */
  }
  return map;
});

// ---- voting power (total bonded tokens, always-LCD) ----
// CORRECTION (verified 2026-08-29 across 8 validators): the indexer's `stakeAmount` is NOT the
// operator's self-stake. It equals the LCD's `tokens` exactly, which equals the sum of every
// delegation — i.e. it is already TOTAL BONDED. This file previously claimed otherwise and the
// validator page rendered it as "Self-stake", showing the same number twice under two labels.
// Self-stake is not readily recoverable: the operator's own delegation does not appear under the
// signer address in the delegations list, and `selfDelegationRewardAmount` implies it is ~1 POKT.
// The LCD remains the primary source here (always-LCD like Delegators, §2); `stakeAmount` is a
// fallback for the same figure, not a different one.
interface LcdValidatorTokens {
  operator_address?: string;
  tokens?: string;
  status?: string;
  jailed?: boolean;
}
interface LcdValidatorsListResponse {
  validators?: LcdValidatorTokens[];
}

/**
 * Everything the chain knows about one validator's standing, straight off the staking module.
 *
 * The indexer cannot answer this: its `Validator` type carries only `stakeStatus`
 * (Staked/Unstaking/Unstaked), a 1:1 mapping of the Cosmos bond status that cannot express
 * "bonded stake, but below the active-set cutoff". Only `jailed` + `status` together separate a
 * candidate from a punished validator. See `deriveValidatorState` in lib/validator.ts.
 */
export interface ValidatorChainEntry {
  /** Total tokens delegated (upokt). Only counts as voting power while BONDED. */
  tokens: string;
  /** Raw Cosmos bond status: BOND_STATUS_BONDED | _UNBONDING | _UNBONDED. */
  status: string;
  jailed: boolean;
}

export interface ValidatorChainStates {
  /**
   * False when the LCD could not be reached. Load-bearing: absence from `byValoper` means
   * "removed from the staking store" ONLY when the read succeeded. Without this flag a single
   * failed LCD call would relabel every validator on the page as Removed.
   */
  ok: boolean;
  byValoper: Map<string, ValidatorChainEntry>;
  /**
   * Sum of tokens across the ACTIVE set (upokt) — the honest denominator for a voting-power
   * share. Verified equal to `/cosmos/staking/v1beta1/pool`'s `bonded_tokens`; including
   * non-bonded validators inflates it and understates everyone's share.
   */
  bondedTotalUpokt: string;
  /** Governance cap on the active set (`max_validators`), null when unavailable. Never assume it. */
  maxValidators: number | null;
}

/**
 * Chain-side standing for the whole validator set. One LCD list call plus the staking params,
 * cache()-deduped + ISR, so every consumer on a page shares a single round trip.
 */
export const getValidatorChainStates = cache(async (network: NetworkId): Promise<ValidatorChainStates> => {
  const byValoper = new Map<string, ValidatorChainEntry>();

  const [list, params] = await Promise.all([
    lcdFetch<LcdValidatorsListResponse>(network, '/cosmos/staking/v1beta1/validators?pagination.limit=500', {
      revalidate: 30,
    }).catch(() => null),
    // max_validators is a governance param and moves by proposal — read it, never hardcode the 21.
    lcdFetch<{ params?: { max_validators?: number } }>(network, '/cosmos/staking/v1beta1/params', {
      revalidate: 300,
    }).catch(() => null),
  ]);

  if (!list) {
    return { ok: false, byValoper, bondedTotalUpokt: '0', maxValidators: params?.params?.max_validators ?? null };
  }

  let bonded = 0n;
  for (const v of list.validators ?? []) {
    if (!v.operator_address) continue;
    const tokens = v.tokens ?? '0';
    const status = v.status ?? '';
    byValoper.set(v.operator_address, { tokens, status, jailed: v.jailed === true });
    if (status === 'BOND_STATUS_BONDED') bonded += toBigInt(tokens);
  }

  return {
    ok: true,
    byValoper,
    bondedTotalUpokt: bonded.toString(),
    maxValidators: params?.params?.max_validators ?? null,
  };
});

export interface ValidatorUnbonding {
  /** Block height at which unbonding completes. */
  height: string;
  /** RFC3339 completion timestamp (Cosmos unbonding period after the unbond began). */
  time: string;
}

// Validator unbonding is Cosmos-side (the `staking` module), NOT the indexer's supplier-style
// `unstakingEndHeight`. The LCD validator record carries `status` + `unbonding_height`/`unbonding_time`;
// they're only meaningful while `status == BOND_STATUS_UNBONDING`.
interface LcdValidatorUnbonding {
  status?: string;
  unbonding_height?: string;
  unbonding_time?: string;
}

/** Unbonding completion (height + time) for a validator, or null unless it is actively unbonding. */
export async function getValidatorUnbonding(network: NetworkId, valoper: string): Promise<ValidatorUnbonding | null> {
  try {
    const res = await lcdFetch<{ validator?: LcdValidatorUnbonding }>(
      network,
      `/cosmos/staking/v1beta1/validators/${valoper}`,
      { revalidate: 30 },
    );
    const v = res.validator;
    if (!v || v.status !== 'BOND_STATUS_UNBONDING') return null;
    return { height: v.unbonding_height ?? '0', time: v.unbonding_time ?? '' };
  } catch {
    return null;
  }
}

// ---- list ----
export async function getValidatorList(network: NetworkId, limit: number, offset: number) {
  const data = await gqlFetch<{ validators: { nodes: ValidatorRow[]; totalCount: number } }>(
    network,
    VALIDATORS_LIST,
    { limit, offset },
    { revalidate: 15 },
  );
  return data.validators;
}

// ---- detail ----
/** Resolve a validator by its valoper id. Returns null (→ notFound) when absent. */
export async function getValidator(network: NetworkId, id: string): Promise<ValidatorDetail | null> {
  const data = await gqlFetch<{ validator: ValidatorDetail | null }>(
    network,
    VALIDATOR_BY_ID,
    { id },
    { revalidate: 30 },
  );
  return data.validator ?? null;
}

/** Read the validator's hex consensus address (`ed25519Id`) — needed to key the uptime query. */
async function getValidatorHexAddress(network: NetworkId, id: string): Promise<string | null> {
  try {
    const data = await gqlFetch<{ validator: { ed25519Id: string | null } | null }>(
      network,
      VALIDATOR_HEX_ADDRESS,
      { id },
      { revalidate: 30 },
    );
    return data.validator?.ed25519Id ?? null;
  } catch {
    return null;
  }
}

/**
 * Produced vs missed blocks over the last UPTIME_WINDOW blocks. Keyed by the validator's hex
 * consensus address (`ed25519Id`, looked up from the valoper `id`). Degrades gracefully (null)
 * if the address is unavailable or the query fails, so the Uptime tab shows an empty state (§11).
 */
export async function getValidatorUptime(network: NetworkId, id: string): Promise<UptimeResult | null> {
  const hexAddress = await getValidatorHexAddress(network, id);
  if (!hexAddress) return null;
  let toHeight: number;
  try {
    const meta = await getMetadata(network);
    toHeight = meta.targetHeight;
  } catch {
    return null;
  }
  const fromHeight = Math.max(1, toHeight - UPTIME_WINDOW);
  try {
    const data = await gqlFetch<{ producedBlocks: number[] | null; missedBlocks: number[] | null }>(
      network,
      VALIDATOR_UPTIME,
      { from: String(fromHeight), validatorHexAddress: hexAddress },
      { revalidate: 15 },
    );
    return {
      produced: Array.isArray(data.producedBlocks) ? data.producedBlocks.map(Number) : [],
      missed: Array.isArray(data.missedBlocks) ? data.missedBlocks.map(Number) : [],
      fromHeight,
      toHeight,
    };
  } catch {
    return null;
  }
}

// ---- delegators (always-LCD, §2) ----
interface LcdDelegationsResponse {
  delegation_responses?: Array<{
    delegation?: { delegator_address?: string; shares?: string };
    balance?: { amount?: string; denom?: string };
  }>;
  pagination?: { total?: string; next_key?: string | null } | null;
}

/**
 * Delegators read live from the Sauron LCD staking endpoint. Empty [] is common.
 * The LCD caps each response at its default page size (100), so follow `pagination.next_key`
 * to return the FULL set — a bounded loop guards against a runaway cursor.
 */
export async function getDelegators(network: NetworkId, valoper: string): Promise<DelegationRow[]> {
  try {
    const rows: NonNullable<LcdDelegationsResponse['delegation_responses']> = [];
    let nextKey: string | null = null;
    for (let i = 0; i < 20; i++) {
      const qs: string = `pagination.limit=500${nextKey ? `&pagination.key=${encodeURIComponent(nextKey)}` : ''}`;
      const res: LcdDelegationsResponse = await lcdFetch<LcdDelegationsResponse>(
        network,
        `/cosmos/staking/v1beta1/validators/${valoper}/delegations?${qs}`,
        { revalidate: 30 },
      );
      rows.push(...(res.delegation_responses ?? []));
      nextKey = res.pagination?.next_key ?? null;
      if (!nextKey) break;
    }
    return rows.map((r) => ({
      delegatorAddress: r.delegation?.delegator_address ?? '',
      shares: r.delegation?.shares ?? '0',
      amount: r.balance?.amount ?? '0',
    }));
  } catch {
    return [];
  }
}

// ---- delegator APR ----

/** Trailing window for the validator's advertised delegator return. */
export const APR_WINDOW_DAYS = 30;

export interface DelegatorApr {
  /** Net annualised return to a delegator, percent. Already after commission — see the query.
   *  Null when the validator has settled for under MIN_SPAN_DAYS: too little data to annualise. */
  aprPct: number | null;
  /** POKT (upokt) paid to delegators over the window, after commission. */
  delegatorUpokt: string;
  /** Commission the operator took over the same window, upokt. */
  commissionUpokt: string;
  /** Mean stake the rewards were divided over, upokt. */
  avgStakeUpokt: string;
  settlements: number;
  /** The span the catalog covered; null from a catalog that predates the range contract. */
  coverage: CoveredRange | null;
  /** Days of the window the catalog has data for, gaps excluded: APR_WINDOW_DAYS when it covers it all. */
  coveredDays: number;
  /** Days the validator was actually settling inside the window. */
  activeDays: number;
  /** True when the validator was not settling for the whole window (joined or paused inside it). */
  partialWindow: boolean;
  /** True when the bonded stake moved during the window, making the mean an approximation. */
  stakeDrifted: boolean;
  /** True when its last settlement is over a day older than the network's latest validator settlement: it is not
   *  settling now (jailed, out of the set, …). Relative to the network, not to now, because beta goes days without any. */
  inactive: boolean;
}

/** One validator and UTC day of getValidatorRewardsJson (numbers serialize as strings). */
interface RewardsDay {
  bucket_start: string;
  bucket_end: string;
  validator_operator: string;
  commission_upokt: string | null;
  delegators_upokt: string | null;
  distributions: string;
  delegated_stake_avg_upokt: string | null;
  delegated_stake_min_upokt: string | null;
  delegated_stake_max_upokt: string | null;
}

/** A validator's window, summed from its day rows. */
interface RewardsWindow {
  settlements: number;
  delegatorUpokt: bigint;
  commissionUpokt: bigint;
  /** Mean stake over every settlement of the window (the day means weighted by their settlements). */
  avgStakeUpokt: number;
  stakeDrifted: boolean;
  /** True when its last settlement is over a day older than the network's latest validator settlement: it is not
   *  settling now (jailed, out of the set, …). Relative to the network, not to now, because beta goes days without any. */
  inactive: boolean;
  /** Epoch ms bracketing the hours it settled, clipped to the window. */
  firstAt: number;
  lastAt: number;
}

const DAY_MS = 86_400_000;
/** Budget for the catalog reads behind a validator's APR. */
const REWARDS_TIMEOUT_MS = 10_000;
const dayOf = (ms: number) => Math.floor(ms / DAY_MS) * DAY_MS;

/**
 * Per-validator windows from the trailing-window catalog call, for every validator: the detail card
 * needs the network's latest settlement for `inactive`, and it shares the list's fetch-cache entries.
 * Also the span the catalog covered, and the window a rate is measured against: the covered part of
 * the trailing window, gaps excluded (null: nothing in it is covered).
 */
async function getRewardsWindows(
  network: NetworkId,
  days: number,
): Promise<{ windows: Map<string, RewardsWindow>; coverage: CoveredRange | null; window: CoveredWindow | null }> {
  // The window ends on the hour: the requests — and their fetch-cache keys — then change once an
  // hour, so only the first visitor after the hour pays for the cold reads (revalidate still
  // refreshes them every 5 minutes). Both reads give up after REWARDS_TIMEOUT_MS: the callers render
  // no rate rather than wait.
  const range = trailingRange(days, 3600);
  const signal = AbortSignal.timeout(REWARDS_TIMEOUT_MS);
  const d = await gqlFetch<{ getValidatorRewardsJson: unknown }>(
    network,
    VALIDATOR_REWARDS,
    { validators: null, ...range, bucket: 'day' },
    { revalidate: 300, signal },
  );
  const { data: dayRows, range: coverage } = unwrapRange<RewardsDay[]>(d.getValidatorRewardsJson);
  // The window is the part the catalog covers: its rows lie there, and gaps count as no time.
  const window = coveredWindow(coverage, Date.parse(range.rangeStart), Date.parse(range.rangeEnd));
  if (!window) return { windows: new Map(), coverage, window };
  const { from, to } = window;
  const out = new Map<string, RewardsWindow & { stakeSum: number; min: bigint | null; max: bigint | null }>();
  for (const r of dayRows ?? []) {
    const n = Number(r.distributions);
    if (!(n > 0)) continue;
    let w = out.get(r.validator_operator);
    if (!w) {
      w = { settlements: 0, delegatorUpokt: BigInt(0), commissionUpokt: BigInt(0), avgStakeUpokt: 0, stakeDrifted: false, inactive: false, firstAt: Infinity, lastAt: -Infinity, stakeSum: 0, min: null, max: null };
      out.set(r.validator_operator, w);
    }
    w.settlements += n;
    w.delegatorUpokt += toBigInt(r.delegators_upokt);
    w.commissionUpokt += toBigInt(r.commission_upokt);
    w.stakeSum += Number(r.delegated_stake_avg_upokt ?? 0) * n;
    const lo = toBigInt(r.delegated_stake_min_upokt);
    const hi = toBigInt(r.delegated_stake_max_upokt);
    if (w.min == null || lo < w.min) w.min = lo;
    if (w.max == null || hi > w.max) w.max = hi;
    w.firstAt = Math.min(w.firstAt, Math.max(Date.parse(r.bucket_start), from));
    w.lastAt = Math.max(w.lastAt, Math.min(Date.parse(r.bucket_end), to));
  }
  for (const w of out.values()) {
    w.avgStakeUpokt = w.stakeSum / w.settlements;
    w.stakeDrifted = w.min !== w.max;
  }

  // Day rows put the span edges on midnight, which would credit a validator that joined at 20:00
  // with the whole day (viewed at 20:30: 20.5 h instead of 0.5 h). Re-read each validator's first
  // and last day by hour — one call per distinct day, in parallel — so the span runs from the hour
  // of its first settlement to the hour of its last. A day whose re-read fails keeps its midnight edges.
  const edgeDays = new Set<number>();
  for (const w of out.values()) {
    edgeDays.add(dayOf(w.firstAt));
    edgeDays.add(dayOf(w.lastAt - 1));
  }
  const byHour = await Promise.allSettled(
    [...edgeDays].map(async (day) => {
      const h = await gqlFetch<{ getValidatorRewardsJson: unknown }>(
        network,
        VALIDATOR_REWARDS,
        {
          validators: null,
          rangeStart: new Date(Math.max(day, from)).toISOString(),
          rangeEnd: new Date(Math.min(day + DAY_MS, to)).toISOString(),
          bucket: 'hour',
        },
        { revalidate: 300, signal },
      );
      return { day, rows: unwrapRange<RewardsDay[]>(h.getValidatorRewardsJson).data ?? [] };
    }),
  );
  const edges = new Map<string, { first: number; last: number }>();
  for (const settled of byHour) {
    if (settled.status !== 'fulfilled') continue;
    const { day, rows } = settled.value;
    for (const r of rows) {
      const w = out.get(r.validator_operator);
      if (!w || !(Number(r.distributions) > 0)) continue;
      const e = edges.get(r.validator_operator) ?? { first: Infinity, last: -Infinity };
      edges.set(r.validator_operator, e);
      if (dayOf(w.firstAt) === day) e.first = Math.min(e.first, Math.max(Date.parse(r.bucket_start), from));
      if (dayOf(w.lastAt - 1) === day) e.last = Math.max(e.last, Math.min(Date.parse(r.bucket_end), to));
    }
  }
  for (const [valoper, e] of edges) {
    const w = out.get(valoper)!;
    if (Number.isFinite(e.first)) w.firstAt = e.first;
    if (Number.isFinite(e.last)) w.lastAt = e.last;
  }
  const latest = Math.max(...[...out.values()].map((w) => w.lastAt));
  for (const w of out.values()) w.inactive = w.lastAt < latest - DAY_MS;
  return { windows: out, coverage, window };
}

/**
 * Net delegator APR for one validator over a trailing window.
 *
 * `delegators_upokt` is already net of commission, so this is what a delegator actually
 * receives — do NOT subtract commission again.
 *
 * Backward-looking by construction: it annualises the relay settlement this validator actually
 * earned in the window. It is not a promised or forward rate, and it moves with network demand.
 */
export async function getValidatorDelegatorApr(
  network: NetworkId,
  valoper: string,
  days = APR_WINDOW_DAYS,
): Promise<DelegatorApr | typeof NOT_COVERED | null> {
  // A failed or timed-out read throws, so the caller can tell "unavailable" from null = "no settlements"
  // and NOT_COVERED = "the catalog has no data for this window".
  const { windows, coverage, window } = await getRewardsWindows(network, days);
  if (!window) return NOT_COVERED;
  const w = windows.get(valoper);
  if (!w) return null;
  const rate = annualise(w, window);
  if (!rate) return null;

  return {
    aprPct: rate.aprPct,
    delegatorUpokt: w.delegatorUpokt.toString(),
    commissionUpokt: w.commissionUpokt.toString(),
    avgStakeUpokt: Math.round(w.avgStakeUpokt).toString(),
    settlements: w.settlements,
    activeDays: rate.spanDays,
    partialWindow: rate.partialWindow,
    stakeDrifted: w.stakeDrifted,
    inactive: w.inactive,
    coverage,
    coveredDays: rate.coveredDays,
  };
}

/**
 * The APR arithmetic itself, shared by the detail card and the list roll-up so the two can never
 * quote different numbers for the same validator.
 *
 * Null means "no rate to report", never "zero": under two settlements, no delegated stake, or an
 * unresolvable span all leave nothing to annualise.
 */
function annualise(
  w: RewardsWindow,
  window: CoveredWindow,
): { aprPct: number | null; spanDays: number; coveredDays: number; partialWindow: boolean } | null {
  // Two settlements is the minimum that defines a rate; below that there is no rate to report.
  if (w.settlements < 2 || !(w.avgStakeUpokt > 0)) return null;
  if (!(w.lastAt > w.firstAt)) return null;

  // The span runs from the start of the hour of the first settlement to the end of the hour of the
  // last one, clipped to the window, less the catalog's gaps (nothing was counted there). Under
  // MIN_SPAN_DAYS of activity there is too little data for an annualised figure: report the
  // validator without a rate.
  const spanDays = coveredMs(window, w.firstAt, w.lastAt) / DAY_MS;
  const coveredDays = coveredMs(window, window.from, window.to) / DAY_MS;
  return {
    aprPct: spanDays < MIN_SPAN_DAYS ? null : ((Number(w.delegatorUpokt) / spanDays) * 365 * 100) / w.avgStakeUpokt,
    spanDays,
    coveredDays,
    // Allow a session's slack: a full window still starts a few minutes after the boundary block.
    partialWindow: spanDays < coveredDays - 0.5,
  };
}

/** One validator's entry in the list-wide APR roll-up. */
export interface DelegatorAprSummary {
  /** Net annualised return to a delegator, percent. Already after commission — see the query.
   *  Null when the validator has settled for under MIN_SPAN_DAYS: too little data to annualise. */
  aprPct: number | null;
  /** Days the validator was actually settling inside the window. */
  activeDays: number;
  /** True when the validator was not settling for the whole window (joined or paused inside it). */
  partialWindow: boolean;
  /** True when the bonded stake moved during the window, making the mean an approximation. */
  stakeDrifted: boolean;
  /** True when its last settlement is over a day older than the network's latest validator settlement: it is not
   *  settling now (jailed, out of the set, …). Relative to the network, not to now, because beta goes days without any. */
  inactive: boolean;
  /** coverageNote of the window (the same for every validator); null when it is fully covered. */
  coverageNote: string | null;
  /** As on DelegatorApr. */
  coveredDays: number;
}

/**
 * Net delegator APR for EVERY validator that settled inside the window, keyed by valoper.
 *
 * Same catalog call and the same arithmetic as `getValidatorDelegatorApr`, for every validator at
 * once (`validators: null`). Validators absent from the map have no rate: render a dash, never a
 * zero, which would read as "earns nothing" rather than "not enough data".
 */
export const getValidatorDelegatorAprMap = cache(async function getValidatorDelegatorAprMap(
  network: NetworkId,
  days = APR_WINDOW_DAYS,
): Promise<Map<string, DelegatorAprSummary>> {
  const out = new Map<string, DelegatorAprSummary>();
  let read: Awaited<ReturnType<typeof getRewardsWindows>>;
  try {
    read = await getRewardsWindows(network, days);
  } catch {
    return out;
  }
  if (!read.window) return out;
  const note = coverageNote(read.coverage);
  for (const [valoper, w] of read.windows) {
    const rate = annualise(w, read.window);
    if (!rate) continue;
    out.set(valoper, {
      aprPct: rate.aprPct,
      activeDays: rate.spanDays,
      partialWindow: rate.partialWindow,
      stakeDrifted: w.stakeDrifted,
      inactive: w.inactive,
      coverageNote: note,
      coveredDays: rate.coveredDays,
    });
  }
  return out;
});
