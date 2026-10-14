import { gqlFetch } from '@/lib/graphql';
import type { NetworkId } from '@/lib/networks';
import { toBigInt } from '@/lib/format';
import { getMetadata } from '@/lib/metadata';
import {
  MORSE_CLAIMABLE_ACCOUNTS,
  MORSE_CLAIMABLE_BY_IDS,
  MORSE_CLAIMABLE_KEYS,
  MORSE_CLAIM_SUMMARY,
  MORSE_SUPPLIER_CLAIMS,
} from '@/lib/queries/migration';

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
  /** A pokt1 search whose walks ran past their cap: the matches may be incomplete. */
  truncated: boolean;
}

const NOTHING: MorseClaimAmounts = { unstakedBalanceUpokt: '0', supplierStakeUpokt: '0', applicationStakeUpokt: '0' };

export const isShannonAddress = (q: string) => /^pokt1/i.test(q);

// Walk caps: up to 10 pages of 1000. On mainnet (2026-10-14) one address holds at most 1,187 supplier claims and at
// most 2,162 accounts were claimed to one address.
const WALK_PAGE = 1000;
const WALK_PAGES = 10;
// ids per `id in [...]` read: each is an index lookup
const ID_CHUNK = 200;

/**
 * Morse node addresses (= the claimed accounts' ids) of every supplier claim whose supplier address or owner is
 * `shannon`. get_morse_claims returns at most rowLimit rows, so a short page is the last one.
 */
async function getSupplierClaimAccountIds(network: NetworkId, shannon: string) {
  const ids = new Set<string>();
  let before: { height: string; id: string } | undefined;
  for (let i = 0; i < WALK_PAGES; i++) {
    const data = await gqlFetch<{ getMorseClaimsList: { height: string; id: string; morseNodeAddress: string }[] | null }>(
      network,
      MORSE_SUPPLIER_CLAIMS,
      { shannon: [shannon], beforeHeight: before?.height, beforeId: before?.id },
      { cache: 'no-store' },
    );
    const rows = data.getMorseClaimsList ?? [];
    for (const r of rows) ids.add(r.morseNodeAddress.toLowerCase());
    if (rows.length < WALK_PAGE) return { ids, truncated: false };
    const last = rows[rows.length - 1];
    before = { height: last.height, id: last.id };
  }
  return { ids, truncated: true };
}

type AccountKey = Pick<MorseClaimableAccountRow, 'id' | 'claimed' | 'claimedAtId'>;

/** Every account claimed to `dest` at `blockHeight`, walked by id (keyset), checked against each page's totalCount. */
async function getDestinationAccountKeys(network: NetworkId, blockHeight: string, dest: string) {
  const keys: AccountKey[] = [];
  let after: string | undefined;
  for (let i = 0; i < WALK_PAGES; i++) {
    const filter = { shannonDestAddress: { equalTo: dest }, ...(after ? { id: { greaterThan: after } } : {}) };
    const data = await gqlFetch<{ morseClaimableAccounts: { totalCount: number; nodes: AccountKey[] } }>(
      network,
      MORSE_CLAIMABLE_KEYS,
      { blockHeight, limit: WALK_PAGE, filter },
      { cache: 'no-store' },
    );
    const { nodes, totalCount } = data.morseClaimableAccounts;
    keys.push(...nodes);
    // totalCount counts what is left from `after` on: when this page holds it all, the walk is complete
    if (nodes.length >= totalCount) return { keys, truncated: false };
    if (nodes.length === 0) return { keys, truncated: true };
    after = nodes[nodes.length - 1].id;
  }
  return { keys, truncated: true };
}

/** The accounts with these ids at `blockHeight`, in reads of ID_CHUNK ids. */
async function getAccountKeysByIds(network: NetworkId, blockHeight: string, ids: string[]) {
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += ID_CHUNK) chunks.push(ids.slice(i, i + ID_CHUNK));
  const pages = await Promise.all(
    chunks.map((chunk) =>
      gqlFetch<{ morseClaimableAccounts: { totalCount: number; nodes: AccountKey[] } }>(
        network,
        MORSE_CLAIMABLE_KEYS,
        { blockHeight, limit: ID_CHUNK, filter: { id: { in: chunk } } },
        { cache: 'no-store' },
      ),
    ),
  );
  return pages.flatMap((p) => p.morseClaimableAccounts.nodes);
}

/** The list's order: claimed first, newest claim first, then id. */
function byClaim(a: AccountKey, b: AccountKey): number {
  if (a.claimed !== b.claimed) return a.claimed ? -1 : 1;
  const ha = toBigInt(a.claimedAtId);
  const hb = toBigInt(b.claimedAtId);
  if (ha !== hb) return ha > hb ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * A Shannon-address search: the accounts claimed to that address, plus the supplier claims it holds as supplier
 * address or owner (the indexer's destination is wrong for some supplier claims). Two sets from separate indexed
 * reads, merged and paged here rather than one OR over thousands of inline ids, which scans the whole table (1.5 s on
 * the database for the largest owner, 2026-10-14). Every entity read is pinned to one height so the parts agree.
 */
async function searchByShannonAddress(network: NetworkId, address: string, limit: number, offset: number): Promise<MorseClaimableAccountPage> {
  // pokt1 addresses are lowercase on chain and stored as the message carried them
  const shannon = address.toLowerCase();
  // the supplier-claims walk and the destination walk (after one _metadata read) run side by side
  const [supplier, { blockHeight, dest }] = await Promise.all([
    getSupplierClaimAccountIds(network, shannon),
    getMetadata(network).then(async (meta) => {
      const height = String(meta.lastProcessedHeight);
      return { blockHeight: height, dest: await getDestinationAccountKeys(network, height, shannon) };
    }),
  ]);
  const seen = new Set(dest.keys.map((k) => k.id));
  const extra = await getAccountKeysByIds(network, blockHeight, [...supplier.ids].filter((id) => !seen.has(id)));
  const all = [...dest.keys, ...extra].sort(byClaim);
  const pageIds = all.slice(offset, offset + limit).map((k) => k.id);
  let nodes: MorseClaimableAccountRow[] = [];
  if (pageIds.length) {
    const data = await gqlFetch<{ morseClaimableAccounts: { nodes: MorseClaimableAccountRow[] } }>(
      network,
      MORSE_CLAIMABLE_BY_IDS,
      { blockHeight, ids: pageIds },
      { cache: 'no-store' },
    );
    const byId = new Map(data.morseClaimableAccounts.nodes.map((n) => [n.id, n]));
    nodes = pageIds.flatMap((id) => byId.get(id) ?? []);
  }
  return { nodes, totalCount: all.length, truncated: supplier.truncated || dest.truncated };
}

/**
 * Morse-address search (`?address=` that is not pokt1): the Morse address or its output (custodial) address, any case.
 * The indexer lowercases ids, so that one is an exact match on its index; the output address is stored as the message
 * carried it, so it compares case-insensitively.
 */
function morseAddressFilter(q: string) {
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
  if (q && isShannonAddress(q)) return searchByShannonAddress(network, q, limit, offset);
  const data = await gqlFetch<{ morseClaimableAccounts: { nodes: MorseClaimableAccountRow[]; totalCount: number } }>(
    network,
    MORSE_CLAIMABLE_ACCOUNTS,
    { limit, offset, filter: q ? morseAddressFilter(q) : undefined },
    // a search is one person's lookup: never cache it; the unfiltered list is shared
    q ? { cache: 'no-store' } : { revalidate: 30 },
  );
  return { ...data.morseClaimableAccounts, truncated: false };
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
