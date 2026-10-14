import { gqlFetch } from '@/lib/graphql';
import type { NetworkId } from '@/lib/networks';
import { MORSE_CLAIMABLE_ACCOUNTS, MORSE_CLAIM_SUMMARY } from '@/lib/queries/migration';

// ---- shapes ----
export interface MorseClaimableAccountRow {
  /** Morse address (hex, lowercased by the indexer) — or a Morse module account name. */
  id: string;
  /** Shannon address the claim minted to (for a supplier claim, its operator). */
  shannonDestAddress: string | null;
  claimed: boolean;
  /** Claim height. */
  claimedAtId: string | null;
  /** Claim tx hash. */
  transactionId: string | null;
  unstakedBalanceAmount: string;
  supplierStakeAmount: string;
  applicationStakeAmount: string;
}

/** One side (claimed or not) of the Morse claimable accounts: how many, and what they hold (upokt). */
export interface MorseClaimSide {
  accounts: string;
  unstakedBalanceUpokt: string;
  supplierStakeUpokt: string;
  applicationStakeUpokt: string;
}

export interface MorseClaimSummary {
  claimed: MorseClaimSide;
  unclaimed: MorseClaimSide;
}

const NO_ACCOUNTS: MorseClaimSide = { accounts: '0', unstakedBalanceUpokt: '0', supplierStakeUpokt: '0', applicationStakeUpokt: '0' };

/**
 * `?address=` → list filter. A `pokt1…` address matches the claim destination; anything else matches the Morse
 * address or its output (custodial) address. Both case-insensitive, like poktscan's /migration.
 */
export function morseAccountFilter(address: string | undefined) {
  const q = address?.trim();
  if (!q) return undefined;
  if (q.startsWith('pokt1')) return { shannonDestAddress: { equalToInsensitive: q } };
  return { or: [{ id: { equalToInsensitive: q } }, { morseOutputAddress: { equalToInsensitive: q } }] };
}

// ---- list ----
export async function getMorseClaimableAccounts(network: NetworkId, limit: number, offset: number, address?: string) {
  const data = await gqlFetch<{ morseClaimableAccounts: { nodes: MorseClaimableAccountRow[]; totalCount: number } }>(
    network,
    MORSE_CLAIMABLE_ACCOUNTS,
    { limit, offset, filter: morseAccountFilter(address) },
    { revalidate: 30 },
  );
  return data.morseClaimableAccounts;
}

// ---- summary ----
export async function getMorseClaimSummary(network: NetworkId): Promise<MorseClaimSummary> {
  const data = await gqlFetch<{ getMorseClaimSummaryList: ({ claimed: boolean } & MorseClaimSide)[] | null }>(
    network,
    MORSE_CLAIM_SUMMARY,
    undefined,
    { revalidate: 30 },
  );
  const rows = data.getMorseClaimSummaryList ?? [];
  const side = (claimed: boolean): MorseClaimSide => {
    const r = rows.find((row) => row.claimed === claimed);
    return r
      ? {
          accounts: r.accounts,
          unstakedBalanceUpokt: r.unstakedBalanceUpokt,
          supplierStakeUpokt: r.supplierStakeUpokt,
          applicationStakeUpokt: r.applicationStakeUpokt,
        }
      : NO_ACCOUNTS;
  };
  return { claimed: side(true), unclaimed: side(false) };
}
