// Status pills (§8.5). Tx result from `code` (0 = success). Stake status from the indexer
// enum Staked/Unstaking/Unstaked — same enum for ALL actors incl. validators (DATA-CONTRACT §1).
//
// Validators are the exception at RENDER time: that enum cannot express "bonded stake, below the
// active-set cutoff", so they get ValidatorStatePill, driven by the chain's own status + jailed
// flags. See deriveValidatorState in lib/validator.ts.

import { VALIDATOR_STATE_META, validatorStateHint, type ValidatorState } from '@/lib/validator';

export function TxResultPill({ code, full = false }: { code: number | string | null | undefined; full?: boolean }) {
  const ok = Number(code) === 0;
  return <span className={`statuspill ${ok ? 's-ok' : 's-fail'}`}>{ok ? (full ? '✓ Success' : 'OK') : full ? 'Failed' : 'Fail'}</span>;
}

const STAKE: Record<string, { cls: string; label: string }> = {
  Staked: { cls: 's-ok', label: 'Staked' },
  Unstaking: { cls: 's-unstk', label: 'Unstaking' },
  Unstaked: { cls: 's-fail', label: 'Unstaked' },
};

export function StakeStatusPill({ status, sm = false }: { status: string | null | undefined; sm?: boolean }) {
  const meta = status ? STAKE[status] : undefined;
  if (!meta) return <span className="muted">{status ?? 'Not staked'}</span>;
  return <span className={`statuspill${sm ? ' sm' : ''} ${meta.cls}`}>{meta.label}</span>;
}

/**
 * Validator standing in the active set. Falls back to the indexer's stake enum when the chain read
 * failed ('unknown'), which is why `fallbackStatus` is required — a validator must never silently
 * render as Removed because one LCD call timed out.
 */
export function ValidatorStatePill({
  state,
  fallbackStatus,
  maxValidators = null,
  sm = false,
}: {
  state: ValidatorState;
  fallbackStatus: string | null | undefined;
  maxValidators?: number | null;
  sm?: boolean;
}) {
  if (state === 'unknown') return <StakeStatusPill status={fallbackStatus} sm={sm} />;
  const meta = VALIDATOR_STATE_META[state];
  return (
    <span className={`statuspill${sm ? ' sm' : ''} ${meta.cls}`} title={validatorStateHint(state, maxValidators)}>
      {meta.label}
    </span>
  );
}
