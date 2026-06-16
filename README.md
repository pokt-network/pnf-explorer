# Pocket Network Explorer

A read-only, Etherscan-style block explorer for the Pocket Network — look up blocks,
transactions, accounts, and validators. Built with Next.js (App Router) + TypeScript + plain CSS.

Deploy target: `explorer.pocket.network`.

## Quick start

```bash
npm install
cp .env.example .env.local   # endpoints are pre-filled; no secrets required
npm run dev                  # http://localhost:3000 (Turbopack)
```

`npm run build` produces a production build; `npm run start` serves it.

## Data sources

- **Primary:** PoktScan/Pocketdex GraphQL indexer — `https://data.pocket.network/graphql`.
- **Fallback / always-LCD content:** Sauron node — Cosmos LCD + Tendermint RPC.

The app reads the indexer's `_metadata` to decide, per request, whether to serve from the
indexer or fall back to LCD/RPC when it lags. Transaction Messages/Events/Raw and validator
Delegators are always read live from the LCD. Caching is Next.js fetch-cache + ISR only — no
database, snapshots, or cron.

Configure endpoints via `.env` (see `.env.example`):

| Var | Purpose |
|---|---|
| `NEXT_PUBLIC_GRAPHQL_URL` | Mainnet GraphQL indexer endpoint |
| `SAURON_LCD_URL` | Mainnet Cosmos LCD base (fallback + always-LCD) |
| `SAURON_RPC_URL` | Mainnet Tendermint RPC base (block fallback) |
| `NEXT_PUBLIC_GRAPHQL_URL_BETA` | Beta TestNet GraphQL indexer (override; default in `lib/networks.ts`) |
| `SAURON_LCD_URL_BETA` | Beta TestNet Cosmos LCD base |
| `SAURON_RPC_URL_BETA` | Beta TestNet Tendermint RPC base |
| `NEXT_PUBLIC_INDEXER_LAG_THRESHOLD` | Blocks of lag before falling back to RPC (default 5) |

## Networks

The explorer serves multiple Pocket Network chains. The active network is carried in the URL path:
**mainnet** is the prefix-less default (`/block/1`); **Beta TestNet** is served under `/beta`
(`/beta/block/1`). `proxy.ts` rewrites prefix-less requests onto the default network; the AppBar
switcher navigates between networks. Endpoints per network live in `lib/networks.ts` and the
active network is threaded into every data call (so per-network ISR cache keys stay distinct).

## Routes

Network-agnostic paths (each also available under `/beta`):
`/` · `/blocks` · `/block/[id]` · `/txs` · `/tx/[id]` · `/accounts` · `/account/[id]` ·
`/validators` · `/validator/[id]` · `/params`, plus global search (height / hash / address /
valoper) in the app bar.

## Project layout

- `app/` — routes (App Router, no `src` dir). `@/*` → project root.
- `components/` — `shell/` (app bar, footer, theme, search, live badge) and `ui/` primitives.
- `lib/` — config, typed GraphQL/LCD fetchers, query strings, and format/time/data helpers.
- `app/globals.css` — the full design system (tokens + components), theme via `data-theme`.

## Deployment

See [`PRE-DEPLOY.md`](./PRE-DEPLOY.md) for the deployment checklist and open data questions to
resolve first. Target platform is Vercel.
