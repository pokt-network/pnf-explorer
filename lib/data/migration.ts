import { gqlFetch } from '@/lib/graphql';
import type { NetworkId } from '@/lib/networks';
import { MORSE_CLAIMABLE_ACCOUNTS, MORSE_CLAIM_SUMMARY, MORSE_SUPPLIER_CLAIMS } from '@/lib/queries/migration';

// ---- shapes ----
export interface MorseClaimableAccountRow {
  /** Morse address (hex, lowercased by the indexer) — or a Morse module account name. */
  id: string;
  /**
   * Shannon address the claim minted to. For a supplier claim the chain records the supplier address
   * (`shannon_operator_address` in the proto); the indexer currently has the owner or NULL in some of those rows (a
   * pocketdex bug being patched).
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

export interface MorseClaimableAccountPage {
  nodes: MorseClaimableAccountRow[];
  totalCount: number;
  /** A pokt1 search whose supplier claims ran past the walk's cap: the matches may be incomplete. */
  truncated: boolean;
}

const NOTHING: MorseClaimAmounts = { unstakedBalanceUpokt: '0', supplierStakeUpokt: '0', applicationStakeUpokt: '0' };

// The supplier-claims walk: up to 10 keyset pages of 1000 (the most supplier claims one address holds on mainnet is
// 1,187, 2026-10-14). It stops on an empty page, never on a short one, so a server cap below 1000 loses nothing.
const SUPPLIER_CLAIM_PAGES = 10;

/**
 * Morse addresses of every supplier claim whose supplier address or owner is `shannon`. The catalog matches the address
 * exactly; pokt1 addresses are lowercase on chain, so the input is lowercased.
 */
async function getSupplierClaimMorseAddresses(network: NetworkId, shannon: string) {
  const ids = new Set<string>();
  let before: { height: string; id: string } | undefined;
  for (let i = 0; i < SUPPLIER_CLAIM_PAGES; i++) {
    const data = await gqlFetch<{ getMorseClaimsList: { height: string; id: string; morseSrcAddress: string }[] | null }>(
      network,
      MORSE_SUPPLIER_CLAIMS,
      { shannon: [shannon.toLowerCase()], beforeHeight: before?.height, beforeId: before?.id },
      { cache: 'no-store' },
    );
    const rows = data.getMorseClaimsList ?? [];
    if (rows.length === 0) return { ids: [...ids], truncated: false };
    for (const r of rows) ids.add(r.morseSrcAddress.toLowerCase());
    const last = rows[rows.length - 1];
    before = { height: last.height, id: last.id };
  }
  return { ids: [...ids], truncated: true };
}

/**
 * `?address=` → list filter, any input case (like poktscan's /migration). A `pokt1…` address matches the claim
 * destination, and the supplier claims it holds as supplier or owner by their Morse address (`supplierIds`), since the
 * destination is not reliable for supplier claims yet. Anything else matches the Morse address or its output
 * (custodial) address. The indexer lowercases ids, so that one is an exact match on its index; the output address and
 * the destination are stored as the message carried them, so those compare case-insensitively.
 */
export function morseAccountFilter(address: string | undefined, supplierIds: string[] = []) {
  const q = address?.trim();
  if (!q) return undefined;
  if (/^pokt1/i.test(q)) {
    const dest = { shannonDestAddress: { equalToInsensitive: q } };
    return supplierIds.length ? { or: [dest, { id: { in: supplierIds } }] } : dest;
  }
  return { or: [{ id: { equalTo: q.toLowerCase() } }, { morseOutputAddress: { equalToInsensitive: q } }] };
}

// ---- list ----
export async function getMorseClaimableAccounts(
  network: NetworkId,
  limit: number,
  offset: number,
  address?: string,
): Promise<MorseClaimableAccountPage> {
  const q = address?.trim();
  const supplier = q && /^pokt1/i.test(q) ? await getSupplierClaimMorseAddresses(network, q) : { ids: [], truncated: false };
  const data = await gqlFetch<{ morseClaimableAccounts: { nodes: MorseClaimableAccountRow[]; totalCount: number } }>(
    network,
    MORSE_CLAIMABLE_ACCOUNTS,
    { limit, offset, filter: morseAccountFilter(q, supplier.ids) },
    // a search is one person's lookup: never cache it; the unfiltered list is shared
    q ? { cache: 'no-store' } : { revalidate: 30 },
  );
  return { ...data.morseClaimableAccounts, truncated: supplier.truncated };
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
