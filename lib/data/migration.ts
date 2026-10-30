import { gqlFetch } from '@/lib/graphql';
import type { NetworkId } from '@/lib/networks';
import { MORSE_CLAIMABLE_ACCOUNTS, MORSE_CLAIMABLE_BY_MORSE_ADDRESS, MORSE_CLAIM_SUMMARY } from '@/lib/queries/migration';

// ---- shapes ----
export interface MorseClaimableAccountRow {
  /** Morse address (hex, lowercased by the indexer) — or a Morse module account name. */
  id: string;
  /**
   * Shannon address the claim minted to, as the chain recorded it. For a supplier claim it depends on the poktroll
   * version at claim time (x/migration/keeper/msg_server_claim_morse_supplier.go): before v0.1.20 (mainnet height
   * 135,297) always the supplier address; since then the owner when the Morse unbonding has elapsed or the stake is below
   * the minimum, otherwise the signing address — the owner for a NON_CUSTODIAL_SIGNED_BY_OWNER claim, the supplier
   * address for the rest. Every account matches the chain since pocketdex's destination patch (2026-10-14); supplier
   * claims indexed later need the pocketdex release with the indexer fix (400e1c1).
   */
  shannonDestAddress: string | null;
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
  /** Every Morse claimable account (= the unfiltered list's totalCount). */
  totalAccounts: number;
  claimedAccounts: string;
  claimed: MorseClaimAmounts;
  unclaimed: MorseClaimAmounts;
}

interface MorseClaimableAccountPage {
  nodes: MorseClaimableAccountRow[];
  totalCount: number;
}

const NOTHING: MorseClaimAmounts = { unstakedBalanceUpokt: '0', supplierStakeUpokt: '0', applicationStakeUpokt: '0' };

const isShannonAddress = (q: string) => /^pokt1/i.test(q);

/**
 * A Morse-address search: the account itself first, then the accounts whose output (custodial) address it is, in the
 * list's order. One request with two aliases (see MORSE_CLAIMABLE_BY_MORSE_ADDRESS); the output alias is paged by the
 * server, its offset moved by one when the account itself takes the first slot.
 *
 * Any input case, matched exactly as stored: the indexer lowercases ids, and output addresses are uppercase hex —
 * poktroll's import tool writes them with cometbft's HexBytes.String() (strings.ToUpper(hex),
 * x/migration/module/cmd/types.go:207), the indexer stores them as imported, and all 11,552 on mainnet are uppercase
 * (2026-10-14). The output address has no index yet (a seq scan, 15–17 ms on mainnet, 2026-10-14); pocketdex gap 32 is
 * to add one, which the exact match will then use.
 */
async function searchByMorseAddress(network: NetworkId, q: string, limit: number, offset: number): Promise<MorseClaimableAccountPage> {
  const data = await gqlFetch<{
    byId: { nodes: MorseClaimableAccountRow[] };
    byOutput: { totalCount: number; nodes: MorseClaimableAccountRow[] };
  }>(
    network,
    MORSE_CLAIMABLE_BY_MORSE_ADDRESS,
    // one more output row than the page, from one slot earlier, covers both cases below
    { id: q.toLowerCase(), output: q.toUpperCase(), limit: limit + 1, offset: Math.max(0, offset - 1) },
    { cache: 'no-store' },
  );
  const self = data.byId.nodes[0];
  const out = data.byOutput.nodes;
  let nodes: MorseClaimableAccountRow[];
  if (self) nodes = offset === 0 ? [self, ...out.slice(0, limit - 1)] : out.slice(0, limit);
  else nodes = offset === 0 ? out.slice(0, limit) : out.slice(1, limit + 1);
  return { nodes, totalCount: data.byOutput.totalCount + (self ? 1 : 0) };
}

// ---- list ----
/**
 * One page of the claimable accounts, optionally filtered by `address` (already trimmed by the caller):
 * - a `pokt1…` address (any case) matches the claim destination. Bech32 is case-insensitive and written lowercase; the
 *   indexer keeps the message's string (lowercase in every row on mainnet, 2026-10-14), so the input is lowercased.
 * - anything else is a Morse address: searchByMorseAddress.
 */
export async function getMorseClaimableAccounts(
  network: NetworkId,
  limit: number,
  offset: number,
  address?: string,
): Promise<MorseClaimableAccountPage> {
  if (address && !isShannonAddress(address)) return searchByMorseAddress(network, address, limit, offset);
  const filter = address ? { shannonDestAddress: { equalTo: address.toLowerCase() } } : undefined;
  const data = await gqlFetch<{ morseClaimableAccounts: MorseClaimableAccountPage }>(
    network,
    MORSE_CLAIMABLE_ACCOUNTS,
    { limit, offset, filter },
    // a search is one person's lookup: never cache it; the unfiltered list is shared
    address ? { cache: 'no-store' } : { revalidate: 30 },
  );
  return data.morseClaimableAccounts;
}

// ---- one account ----
/**
 * The claimable-account row of one Morse address (any case; the indexer lowercases ids), or null when the address held
 * nothing to claim. The Morse archive's account, node and app pages show it as the address's Shannon migration. Cached
 * like the unfiltered list: a claim lands on the chain at most once per account.
 */
export async function getMorseClaim(network: NetworkId, morseAddress: string): Promise<MorseClaimableAccountRow | null> {
  const data = await gqlFetch<{ morseClaimableAccounts: MorseClaimableAccountPage }>(
    network,
    MORSE_CLAIMABLE_ACCOUNTS,
    { limit: 1, offset: 0, filter: { id: { equalTo: morseAddress.toLowerCase() } } },
    { revalidate: 30 },
  );
  return data.morseClaimableAccounts.nodes[0] ?? null;
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
  return {
    totalAccounts: Number(claimed?.accounts ?? 0) + Number(unclaimed?.accounts ?? 0),
    claimedAccounts: claimed?.accounts ?? '0',
    claimed: amounts(claimed),
    unclaimed: amounts(unclaimed),
  };
}
