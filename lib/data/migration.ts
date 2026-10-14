import { gqlFetch } from '@/lib/graphql';
import type { NetworkId } from '@/lib/networks';
import { MORSE_CLAIMABLE_ACCOUNTS, MORSE_CLAIM_SUMMARY } from '@/lib/queries/migration';

// ---- shapes ----
export interface MorseClaimableAccountRow {
  /** Morse address (hex, lowercased by the indexer) — or a Morse module account name. */
  id: string;
  /**
   * Shannon address the claim minted to. For a supplier claim the chain records the operator; the indexer has it for
   * most of them but NULL in 59 rows and the owner in 18 (mainnet, 2026-10-14; being fixed in pocketdex).
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

/**
 * `?address=` → list filter. A `pokt1…` address matches the claim destination; anything else matches the Morse
 * address or its output (custodial) address. Any input case is accepted, like poktscan's /migration, but matched
 * exactly against how each column is stored — ids and destinations lowercase, output addresses uppercase (mainnet,
 * 2026-10-14) — instead of lower() on every row. Still a scan of the 57,762 rows (the output address and the
 * destination have no index): ~15–20 ms on the database.
 */
export function morseAccountFilter(address: string | undefined) {
  const q = address?.trim();
  if (!q) return undefined;
  if (/^pokt1/i.test(q)) return { shannonDestAddress: { equalTo: q.toLowerCase() } };
  return { or: [{ id: { equalTo: q.toLowerCase() } }, { morseOutputAddress: { equalTo: q.toUpperCase() } }] };
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
