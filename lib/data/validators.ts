import { cache } from 'react';
import { gqlFetch } from '@/lib/graphql';
import { lcdFetch } from '@/lib/lcd';
import { getMetadata } from '@/lib/metadata';
import type { NetworkId } from '@/lib/networks';
import { validatorMoniker } from '@/lib/validator';
import { VALIDATORS_LIST, VALIDATOR_BY_ID, VALIDATOR_UPTIME } from '@/lib/queries/validators';

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
// The indexer's `stakeAmount` is the operator SELF-stake only (the amount the operator staked at
// create time). True voting power / security weight is the validator's total bonded `tokens`
// (self-stake + all delegations), which the indexer does not expose — only the Cosmos LCD does.
// Like Delegators (§2), this is inherently always-LCD; callers fall back to `stakeAmount` if absent.
interface LcdValidatorTokens {
  operator_address?: string;
  tokens?: string;
}
interface LcdValidatorsListResponse {
  validators?: LcdValidatorTokens[];
}

/** valoper → total bonded tokens (upokt). One LCD call for the whole set, cache()-deduped + ISR. */
export const getBondedTokensMap = cache(async (network: NetworkId): Promise<Map<string, string>> => {
  const map = new Map<string, string>();
  try {
    const res = await lcdFetch<LcdValidatorsListResponse>(
      network,
      '/cosmos/staking/v1beta1/validators?pagination.limit=500',
      { revalidate: 30 },
    );
    for (const v of res.validators ?? []) {
      if (v.operator_address) map.set(v.operator_address, v.tokens ?? '0');
    }
  } catch {
    /* empty map → callers fall back to indexer stakeAmount */
  }
  return map;
});

/** Total bonded tokens (upokt) for one validator — its voting/security weight. null on failure. */
export async function getValidatorBondedTokens(network: NetworkId, valoper: string): Promise<string | null> {
  try {
    const res = await lcdFetch<{ validator?: LcdValidatorTokens }>(
      network,
      `/cosmos/staking/v1beta1/validators/${valoper}`,
      { revalidate: 30 },
    );
    return res.validator?.tokens ?? null;
  } catch {
    return null;
  }
}

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
