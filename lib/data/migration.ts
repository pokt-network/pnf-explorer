import { unstable_cache } from 'next/cache';
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
// ids per `id in [...]` read (each an index lookup), and how many such reads run at once
const ID_CHUNK = 200;
const ID_CHUNK_CONCURRENCY = 4;
// how long a Shannon search's matched set is reused while paging through it
const SEARCH_TTL_SECONDS = 60;

type AccountKey = Pick<MorseClaimableAccountRow, 'id' | 'claimed' | 'claimedAtId'>;

/** `fn` over `items`, at most `limit` calls in flight; results in input order. */
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

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

/** The accounts with these ids at `blockHeight`, in reads of ID_CHUNK ids, ID_CHUNK_CONCURRENCY at a time. */
async function getAccountKeysByIds(network: NetworkId, blockHeight: string, ids: string[]) {
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += ID_CHUNK) chunks.push(ids.slice(i, i + ID_CHUNK));
  const pages = await mapLimit(chunks, ID_CHUNK_CONCURRENCY, (chunk) =>
    gqlFetch<{ morseClaimableAccounts: { nodes: AccountKey[] } }>(
      network,
      MORSE_CLAIMABLE_KEYS,
      { blockHeight, limit: ID_CHUNK, filter: { id: { in: chunk } } },
      { cache: 'no-store' },
    ),
  );
  return pages.flatMap((p) => p.morseClaimableAccounts.nodes);
}

// ---- supplier-claims workaround ----
// The indexer's destination is wrong for some supplier claims (owner or NULL instead of the supplier address); a
// pocketdex patch is on its way. Until it lands, a Shannon search also finds the supplier claims the address holds as
// supplier address or owner through get_morse_claims. Once the destinations are fixed, delete this section and its one
// call in getShannonSearchSet.

/**
 * Morse node addresses (= the claimed accounts' ids) of every supplier claim whose supplier address or owner is
 * `shannon`, and the newest claim height seen. get_morse_claims applies LIMIT rowLimit, so a page shorter than the
 * rowLimit sent is the last one.
 */
async function getSupplierClaimAccountIds(network: NetworkId, shannon: string) {
  const ids = new Set<string>();
  let newestHeight = 0;
  let before: { height: string; id: string } | undefined;
  for (let i = 0; i < WALK_PAGES; i++) {
    const data = await gqlFetch<{ getMorseClaimsList: { height: string; id: string; morseNodeAddress: string | null }[] | null }>(
      network,
      MORSE_SUPPLIER_CLAIMS,
      { shannon: [shannon], rowLimit: WALK_PAGE, beforeHeight: before?.height, beforeId: before?.id },
      { cache: 'no-store' },
    );
    const rows = data.getMorseClaimsList ?? [];
    for (const r of rows) {
      if (r.morseNodeAddress) ids.add(r.morseNodeAddress.toLowerCase());
      newestHeight = Math.max(newestHeight, Number(r.height));
    }
    if (rows.length < WALK_PAGE) return { ids, newestHeight, truncated: false };
    const last = rows[rows.length - 1];
    before = { height: last.height, id: last.id };
  }
  return { ids, newestHeight, truncated: true };
}
// ---- end of the supplier-claims workaround ----

/** The list's order: claimed first, newest claim first, then id. */
function byClaim(a: AccountKey, b: AccountKey): number {
  if (a.claimed !== b.claimed) return a.claimed ? -1 : 1;
  const ha = toBigInt(a.claimedAtId);
  const hb = toBigInt(b.claimedAtId);
  if (ha !== hb) return ha > hb ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

interface ShannonSearchSet {
  /** The height every account read was pinned to. */
  blockHeight: string;
  /** Every match, in the list's order. */
  keys: AccountKey[];
  truncated: boolean;
}

/**
 * Everything a Shannon search matches, in order: the accounts claimed to the address, plus (workaround above) the
 * supplier claims it holds as supplier address or owner. Two sets from indexed reads, merged here rather than one OR over
 * thousands of inline ids, which scans the whole table (0.6–1.5 s on the database for the largest owner, 2026-10-14).
 *
 * Height: every account read is pinned to one blockHeight, the larger of _metadata.lastProcessedHeight and the newest
 * supplier claim the walk saw, so no claim the walk returned is read before it happened. get_morse_claims itself cannot
 * be pinned; a supplier claim indexed after its walk is missed until the cached set expires.
 */
async function getShannonSearchSet(network: NetworkId, shannon: string): Promise<ShannonSearchSet> {
  const [meta, supplier] = await Promise.all([getMetadata(network), getSupplierClaimAccountIds(network, shannon)]);
  const blockHeight = String(Math.max(meta.lastProcessedHeight, supplier.newestHeight));
  const [dest, claimed] = await Promise.all([
    getDestinationAccountKeys(network, blockHeight, shannon),
    getAccountKeysByIds(network, blockHeight, [...supplier.ids]),
  ]);
  const byId = new Map<string, AccountKey>();
  for (const k of [...dest.keys, ...claimed]) byId.set(k.id, k);
  return { blockHeight, keys: [...byId.values()].sort(byClaim), truncated: supplier.truncated || dest.truncated };
}

// Paging re-reads the same set: keep it for SEARCH_TTL_SECONDS per (network, address). The height is part of the value,
// not the key — keying by it would need a _metadata read before every lookup, and it moves every block.
const getCachedShannonSearchSet = unstable_cache(getShannonSearchSet, ['migration-shannon-search-set'], {
  revalidate: SEARCH_TTL_SECONDS,
});

/** One page of a Shannon search: the cached set, sliced, then those rows read by id at the set's height. */
async function searchByShannonAddress(network: NetworkId, address: string, limit: number, offset: number): Promise<MorseClaimableAccountPage> {
  // Bech32 addresses are case-insensitive and written lowercase; the indexer stores them as the message carried them
  // (lowercase in every row, mainnet 2026-10-14), so the input is lowercased and matched exactly.
  const { blockHeight, keys, truncated } = await getCachedShannonSearchSet(network, address.toLowerCase());
  const pageIds = keys.slice(offset, offset + limit).map((k) => k.id);
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
  return { nodes, totalCount: keys.length, truncated };
}

/**
 * Morse-address search (`?address=` that is not pokt1): the Morse address or its output (custodial) address, any input
 * case, matched exactly as stored — the indexer lowercases ids, and output addresses come from the Morse state export
 * as uppercase hex (poktroll's import tool writes HexBytes.String(), i.e. strings.ToUpper(hex)).
 */
function morseAddressFilter(q: string) {
  return { or: [{ id: { equalTo: q.toLowerCase() } }, { morseOutputAddress: { equalTo: q.toUpperCase() } }] };
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
