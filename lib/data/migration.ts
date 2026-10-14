import { gqlFetch } from '@/lib/graphql';
import type { NetworkId } from '@/lib/networks';
import { MORSE_CLAIMABLE_ACCOUNTS, MORSE_CLAIM_SUMMARY } from '@/lib/queries/migration';

// ---- shapes ----
export interface MorseClaimableAccountRow {
  /** Morse address (hex, lowercased by the indexer) — or a Morse module account name. */
  id: string;
  /**
   * Shannon address the claim minted to. For a supplier claim the chain records the supplier address
   * (`shannon_operator_address` in the proto), and so does the indexer since pocketdex's destination patch (2026-10-14).
   */
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

/** What one side (claimed or not) of the Morse claimable accounts holds, upokt. */
export interface MorseClaimAmounts {
  unstakedBalanceUpokt: string;
  supplierStakeUpokt: string;
  applicationStakeUpokt: string;
}

export interface MorseClaimSummary {
  claimedAccounts: string;
  claimed: MorseClaimAmounts;
  unclaimed: MorseClaimAmounts;
}

const NOTHING: MorseClaimAmounts = { unstakedBalanceUpokt: '0', supplierStakeUpokt: '0', applicationStakeUpokt: '0' };

export const isShannonAddress = (q: string) => /^pokt1/i.test(q);

/**
 * `?address=` → list filter. Any input case is accepted (like poktscan's /migration) and matched exactly as stored:
 * - a `pokt1…` address matches the claim destination. Bech32 is case-insensitive and written lowercase; the indexer
 *   keeps the message's string (lowercase in every row on mainnet, 2026-10-14), so the input is lowercased. For a
 *   supplier claim the destination is the supplier address: searching by its owner finds only what was claimed to the
 *   owner itself, as on poktscan.
 * - anything else matches the Morse address or its output (custodial) address: the indexer lowercases ids, and output
 *   addresses come from the Morse state export as uppercase hex (poktroll's import tool writes HexBytes.String(), i.e.
 *   strings.ToUpper(hex)).
 */
export function morseAccountFilter(q: string) {
  if (isShannonAddress(q)) return { shannonDestAddress: { equalTo: q.toLowerCase() } };
  return { or: [{ id: { equalTo: q.toLowerCase() } }, { morseOutputAddress: { equalTo: q.toUpperCase() } }] };
}

// ---- list ----
export async function getMorseClaimableAccounts(network: NetworkId, limit: number, offset: number, address?: string) {
  const q = address?.trim();
  const data = await gqlFetch<{ morseClaimableAccounts: { nodes: MorseClaimableAccountRow[]; totalCount: number } }>(
    network,
    MORSE_CLAIMABLE_ACCOUNTS,
    { limit, offset, filter: q ? morseAccountFilter(q) : undefined },
    // a search is one person's lookup: never cache it; the unfiltered list is shared
    q ? { cache: 'no-store' } : { revalidate: 30 },
  );
  return data.morseClaimableAccounts;
}

// ---- summary ----
export async function getMorseClaimSummary(network: NetworkId): Promise<MorseClaimSummary> {
  const data = await gqlFetch<{ getMorseClaimSummaryList: ({ claimed: boolean; accounts: string } & MorseClaimAmounts)[] | null }>(
    network,
    MORSE_CLAIM_SUMMARY,
    undefined,
    { revalidate: 30 },
  );
  const rows = data.getMorseClaimSummaryList ?? [];
  const claimed = rows.find((r) => r.claimed);
  const unclaimed = rows.find((r) => !r.claimed);
  const amounts = (row: typeof claimed): MorseClaimAmounts => {
    if (!row) return NOTHING;
    const { unstakedBalanceUpokt, supplierStakeUpokt, applicationStakeUpokt } = row;
    return { unstakedBalanceUpokt, supplierStakeUpokt, applicationStakeUpokt };
  };
  return { claimedAccounts: claimed?.accounts ?? '0', claimed: amounts(claimed), unclaimed: amounts(unclaimed) };
}
