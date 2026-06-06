// Centralized environment access (§5). Never read process.env elsewhere.

/** Primary GraphQL indexer endpoint (public — the live badge polls it client-side). */
export const GRAPHQL_URL =
  process.env.NEXT_PUBLIC_GRAPHQL_URL ?? 'https://data.pocket.network/graphql';

/** Sauron Cosmos LCD base (server-side fallback + always-LCD content). */
export const SAURON_LCD_URL =
  process.env.SAURON_LCD_URL ?? 'https://sauron-api.infra.pocket.network';

/** Sauron Tendermint RPC base (server-side block fallback). */
export const SAURON_RPC_URL =
  process.env.SAURON_RPC_URL ?? 'https://sauron-rpc.infra.pocket.network';

/**
 * Indexer lag tolerance in blocks. If `targetHeight - lastProcessedHeight`
 * exceeds this (or the indexer is unhealthy), pages fall back to LCD/RPC (§2).
 */
export const INDEXER_LAG_THRESHOLD = Number(
  process.env.NEXT_PUBLIC_INDEXER_LAG_THRESHOLD ??
    process.env.INDEXER_LAG_THRESHOLD ??
    5,
);

/** Micro-POKT per POKT. Balances/stakes are denominated in upokt (§5). */
export const UPOKT_PER_POKT = 1_000_000;
