import { MORSE_API_URL } from '@/lib/config';
import { DataError } from '@/lib/errors';
import type {
  MorseAccount,
  MorseApp,
  MorseBlock,
  MorseBlockSummary,
  MorseNode,
  MorsePage,
  MorseSearchHit,
  MorseStakeStatus,
  MorseTransfer,
  MorseTx,
  MorseTxType,
} from './types';

// Morse archive reads (pokt-network/pokt-morse-api). The chain halted at MORSE_FINAL_HEIGHT and its data never
// changes, so every server read sits in Next's fetch cache for a day. That cache is safe here, unlike for the GraphQL
// indexer (lib/graphql.ts): Next stores only HTTP 200 responses, and this API answers every failure with a non-2xx
// status (404 not_found, 400 invalid_parameter, 503 busy/timeout, 429 from the ingress), so an error is never kept.
//
// The ingress allows about 100 requests per 10 s per client IP, and server renders all leave from a few egress IPs,
// so the long cache is also what keeps a crawl of the archive under that limit.

/** Height of the last Morse block. The chain is halted; this never moves. */
export const MORSE_FINAL_HEIGHT = 170617;

/** Seconds a Morse read is cached. A day rather than forever, so a fix to the API's read models still shows up. */
const REVALIDATE = 86_400;

/** Largest page the API serves. */
export const MORSE_MAX_LIMIT = 100;

const HEX40 = /^[0-9a-fA-F]{40}$/;
const HEX64 = /^[0-9a-fA-F]{64}$/;

/** A Morse address (40 hex), normalized to the API's lowercase; null when the input isn't one. */
export function morseAddress(raw: string): string | null {
  const v = raw.trim().replace(/^0x/i, '');
  return HEX40.test(v) ? v.toLowerCase() : null;
}

/** A Morse tx hash (64 hex), normalized to uppercase; null when the input isn't one. */
export function morseHash(raw: string): string | null {
  const v = raw.trim().replace(/^0x/i, '');
  return HEX64.test(v) ? v.toUpperCase() : null;
}

/** A block height within the Morse chain; null otherwise. */
export function morseHeight(raw: string): number | null {
  if (!/^\d+$/.test(raw.trim())) return null;
  const h = Number(raw);
  return h >= 1 && h <= MORSE_FINAL_HEIGHT ? h : null;
}

type Query = Record<string, string | number | boolean | null | undefined>;

function url(path: string, query?: Query): string {
  const u = new URL(path, MORSE_API_URL);
  for (const [k, v] of Object.entries(query ?? {})) if (v != null && v !== '') u.searchParams.set(k, String(v));
  return u.toString();
}

/**
 * One GET. Returns null on 404 (`not_found`) so a detail page can render its own not-found; every other failure throws
 * a DataError carrying the API's stable `code` (or the 429 rate limit, whose body is HTML, not the error schema).
 */
async function get<T>(path: string, query?: Query, init?: { cache?: RequestCache; signal?: AbortSignal }): Promise<T | null> {
  const req: RequestInit & { next?: { revalidate: number } } = init?.cache ? { cache: init.cache } : { next: { revalidate: REVALIDATE } };
  req.signal = init?.signal ?? AbortSignal.timeout(20_000);
  let res: Response;
  try {
    res = await fetch(url(path, query), req);
  } catch (e) {
    throw new DataError(`Network error reaching the Morse archive: ${(e as Error).message}`, 'network');
  }
  if (res.ok) return (await res.json()) as T;
  if (res.status === 404) return null;
  if (res.status === 429) throw new DataError('The Morse archive is rate limiting requests; try again in a few seconds.', 'server', 429);
  let code = '';
  try {
    code = ((await res.json()) as { error?: { code?: string } }).error?.code ?? '';
  } catch {
    /* non-JSON body: the status is all there is */
  }
  const message =
    code === 'busy' || code === 'timeout'
      ? 'The Morse archive is busy; try again in a few seconds.'
      : `The Morse archive responded ${res.status}${code ? ` (${code})` : ''}.`;
  throw new DataError(message, 'server', res.status);
}

/** A list read: a missing list (404 on a path that exists) can't happen, so null is an error here. */
async function list<T>(path: string, query: Query): Promise<MorsePage<T>> {
  const page = await get<MorsePage<T>>(path, query);
  if (!page) throw new DataError('The Morse archive returned no list.', 'not-found', 404);
  return page;
}

export interface PageArgs {
  limit: number;
  cursor?: string;
}

// ---- blocks ----
export const getMorseBlocks = (p: PageArgs & { producer?: string }) =>
  list<MorseBlockSummary>('/v1/blocks', { limit: p.limit, cursor: p.cursor, producer: p.producer });
export const getMorseBlock = (height: number) => get<MorseBlock>(`/v1/blocks/${height}`);
/** The last block: the chain's final state (node/app/account totals as the chain halted). */
export const getMorseFinalBlock = () => getMorseBlock(MORSE_FINAL_HEIGHT);

// ---- txs ----
export const getMorseTxs = (p: PageArgs & { type?: MorseTxType; address?: string; height?: number }) =>
  list<MorseTx>('/v1/txs', { limit: p.limit, cursor: p.cursor, type: p.type, address: p.address, height: p.height });
export const getMorseTx = (hash: string) => get<MorseTx>(`/v1/txs/${hash}`);

// ---- nodes ----
export const getMorseNodes = (p: PageArgs & { status?: MorseStakeStatus; jailed?: boolean; chain?: string }) =>
  list<MorseNode>('/v1/nodes', { limit: p.limit, cursor: p.cursor, status: p.status, jailed: p.jailed, chain: p.chain });
export const getMorseNode = (address: string) => get<MorseNode>(`/v1/nodes/${address}`);

// ---- apps ----
export const getMorseApps = (p: PageArgs & { status?: MorseStakeStatus; chain?: string }) =>
  list<MorseApp>('/v1/apps', { limit: p.limit, cursor: p.cursor, status: p.status, chain: p.chain });
export const getMorseApp = (address: string) => get<MorseApp>(`/v1/apps/${address}`);

// ---- accounts ----
export const getMorseAccounts = (p: PageArgs) => list<MorseAccount>('/v1/accounts', { limit: p.limit, cursor: p.cursor });
export const getMorseAccount = (address: string) => get<MorseAccount>(`/v1/accounts/${address}`);

// ---- transfers ----
export const getMorseTransfers = (p: PageArgs & { address: string }) =>
  list<MorseTransfer>('/v1/transfers', { limit: p.limit, cursor: p.cursor, address: p.address });

// ---- search ----
/**
 * Resolve a hash, public key, address or height to what it identifies. Runs in the browser from the archive's global
 * search (CORS is open), uncached: each query is one person's lookup.
 */
export async function searchMorse(q: string, signal?: AbortSignal): Promise<MorseSearchHit[]> {
  const res = await get<{ items: MorseSearchHit[] }>('/v1/search', { q }, { cache: 'no-store', signal });
  return res?.items ?? [];
}

/** The same lookup from a server render, cached like every other archive read (an address's roles never change). */
export async function getMorseSearch(q: string): Promise<MorseSearchHit[]> {
  return (await get<{ items: MorseSearchHit[] }>('/v1/search', { q }))?.items ?? [];
}

/** The detail path of a search hit, under /morse. */
export function morseHitHref(hit: MorseSearchHit): string | null {
  switch (hit.entity) {
    case 'block':
      return hit.height != null ? `/morse/block/${hit.height}` : null;
    case 'tx':
      return hit.hash ? `/morse/tx/${hit.hash}` : null;
    case 'node':
    case 'app':
    case 'account':
      return hit.address ? `/morse/${hit.entity}/${hit.address}` : null;
  }
}
