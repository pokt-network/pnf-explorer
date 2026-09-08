// Validator field parsers (DATA-CONTRACT §2,§3). commission + description come back as
// JSON objects from the indexer, NOT scalars — never read them raw in the UI.

export interface ValidatorCommission {
  rate?: string;
  maxRate?: string;
  maxChangeRate?: string;
}

export interface ValidatorDescription {
  moniker?: string;
  identity?: string;
  website?: string;
  securityContact?: string;
  details?: string;
}

function asObject<T>(value: unknown): T | null {
  if (value == null) return null;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as T;
    } catch {
      return null;
    }
  }
  if (typeof value === 'object') return value as T;
  return null;
}

/** Commission rate as a percentage number. Stored as 1e18 fixed-point string (1e18 = 100%). */
export function commissionRatePct(commission: unknown): number | null {
  const c = asObject<ValidatorCommission>(commission);
  if (!c?.rate) return null;
  // 1e18 == 100% → divide by 1e16 to get percent. Number is safe (rate < 1e18).
  return Number(c.rate) / 1e16;
}

/** Formatted commission, e.g. "5.00%". */
export function formatCommission(commission: unknown, decimals = 2): string {
  const pct = commissionRatePct(commission);
  return pct == null ? '—' : `${pct.toFixed(decimals)}%`;
}

/** Validator display name = description.moniker, falling back to a truncated address upstream. */
export function validatorMoniker(description: unknown): string | null {
  const d = asObject<ValidatorDescription>(description);
  const m = d?.moniker?.trim();
  return m ? m : null;
}

export function validatorDescription(description: unknown): ValidatorDescription | null {
  return asObject<ValidatorDescription>(description);
}

// ---- active-set state (Cosmos staking, NOT the indexer's StakeStatus) ----
//
// Why this exists: the indexer's StakeStatus enum is Staked/Unstaking/Unstaked for every actor,
// which is a faithful mapping of the Cosmos bond status but a misleading LABEL for validators.
// Cosmos bonds only the top `max_validators` by stake; everyone below the cut is BOND_STATUS_UNBONDED
// even though their delegations are untouched. Rendering that as "Unstaked" tells a reader the
// operator withdrew, and files a healthy candidate alongside validators jailed for downtime.
//
// Verified live (2026-09-08, mainnet): max_validators=21, exactly 21 BONDED, and the Tendermint
// consensus set reports total=21 — so bonded == active set == signing, with no fourth case. One
// validator (LuckyDraw.day, 300k POKT, not jailed) sat at rank 22 and read as "Unstaked".
//
// Two traps this encodes:
//   - UNBONDING is NOT necessarily a voluntary exit. A validator out-staked out of the top N also
//     goes BONDED -> UNBONDING -> UNBONDED with its delegations intact, so "Leaving" is deliberately
//     neutral about intent.
//   - jailed is orthogonal to status, so it must be tested FIRST: a jailed validator is always
//     UNBONDED or UNBONDING, and being jailed is the salient fact about it.

export type ValidatorState = 'active' | 'inactive' | 'leaving' | 'jailed' | 'removed' | 'unknown';

/** What the chain reports for one validator. Mirrors ValidatorChainEntry in lib/data/validators. */
export interface ValidatorChainFacts {
  status: string;
  jailed: boolean;
}

/**
 * Resolve a validator's display state from its staking-module record.
 *
 * `entry` is undefined when the validator is absent from the staking store — Cosmos drops the
 * record once a validator is unbonded with no remaining shares, and the indexer keeps serving it.
 * That is a real, distinct state ("Removed"), but ONLY when the read actually succeeded: pass
 * `ok: false` on an LCD failure and this returns 'unknown' so callers fall back to the indexer
 * enum rather than declaring the whole set removed.
 */
export function deriveValidatorState(entry: ValidatorChainFacts | undefined, ok: boolean): ValidatorState {
  if (!ok) return 'unknown';
  if (!entry) return 'removed';
  if (entry.jailed) return 'jailed';
  if (entry.status === 'BOND_STATUS_BONDED') return 'active';
  if (entry.status === 'BOND_STATUS_UNBONDING') return 'leaving';
  return 'inactive';
}

/** True while the validator is in the active set — the only state with consensus voting power. */
export function isActiveValidator(state: ValidatorState): boolean {
  return state === 'active';
}

export interface ValidatorStateMeta {
  label: string;
  /** Pill class; the five states ramp green -> yellow-green -> yellow -> orange -> red. */
  cls: string;
  /** Hover text. `{max}` is substituted with the live max_validators when one is known. */
  hint: string;
}

export const VALIDATOR_STATE_META: Record<Exclude<ValidatorState, 'unknown'>, ValidatorStateMeta> = {
  active: {
    label: 'Active',
    cls: 's-active',
    hint: 'In the active set{max} — signing blocks and earning rewards.',
  },
  inactive: {
    label: 'Inactive',
    cls: 's-inactive',
    hint: 'Staked, but below the active-set cutoff{max}. Delegations are intact; it earns nothing until it moves up.',
  },
  leaving: {
    label: 'Leaving',
    cls: 's-leaving',
    hint: 'Unbonding out of the active set. This happens on a voluntary exit and when a validator is out-staked out of the set.',
  },
  jailed: {
    label: 'Jailed',
    cls: 's-jailed',
    hint: 'Removed from the active set for missing blocks. Can rejoin by unjailing.',
  },
  removed: {
    label: 'Removed',
    cls: 's-removed',
    hint: 'No longer in the chain’s staking store — fully unbonded with no remaining delegations.',
  },
};

/** Hover text for a state, with the live active-set cap folded in when it is known. */
export function validatorStateHint(state: Exclude<ValidatorState, 'unknown'>, maxValidators: number | null): string {
  const max = maxValidators ? ` (top ${maxValidators} by stake)` : '';
  return VALIDATOR_STATE_META[state].hint.replace('{max}', max);
}
