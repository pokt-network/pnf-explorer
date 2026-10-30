// Centralized environment access (§5). Never read process.env elsewhere.
//
// Per-network endpoints now live in `lib/networks.ts` (the URL carries the active network and the
// fetchers resolve endpoints from the registry). This file holds the network-agnostic config.

/**
 * Indexer lag tolerance in blocks. If `targetHeight - lastProcessedHeight`
 * exceeds this (or the indexer is unhealthy), pages fall back to LCD/RPC (§2).
 */
export const INDEXER_LAG_THRESHOLD = Number(
  process.env.NEXT_PUBLIC_INDEXER_LAG_THRESHOLD ??
    process.env.INDEXER_LAG_THRESHOLD ??
    5,
);

/**
 * Morse archive REST API (pokt-network/pokt-morse-api): the frozen dataset of the halted Morse chain. Public, CORS
 * open — the archive's global search calls it from the browser, so this is a NEXT_PUBLIC value.
 */
export const MORSE_API_URL = process.env.NEXT_PUBLIC_MORSE_API_URL ?? 'https://morse-api.pocket.network';

/** Micro-POKT per POKT. Balances/stakes are denominated in upokt (§5). */
export const UPOKT_PER_POKT = 1_000_000;

/**
 * Operator's own gateway address(es), comma-separated. Optional — when set, the supplier Traffic
 * tab highlights services whose routing gateway matches one of these ("via your gateway"). Unset on
 * the public deployment → the highlight is simply omitted (routing gateways still shown for all).
 */
export const HOME_GATEWAYS: string[] = (process.env.NEXT_PUBLIC_HOME_GATEWAYS ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
