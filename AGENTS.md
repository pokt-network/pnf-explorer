<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

Notably (Next 16): dynamic route `params` and `searchParams` are **async** (`await params`); `fetch` caching is opt-in per call via `{ next: { revalidate } }` / `cache`.
<!-- END:nextjs-agent-rules -->

# Pocket Network Explorer (explorer.pocket.network)

Read-only, Etherscan-style block explorer for Pocket Network's **Shannon** (Cosmos SDK) chain.
Next.js (App Router) + TypeScript + plain CSS. Analytics/dashboards are explicitly OUT of scope.

## Sources of truth (read before building)
- **Build brief:** `assets/explorer-build-brief.md` — prescriptive; do not redesign or invent fields.
- **Mockups:** `assets/explorer-{home,detail-pages,account-validator,list-pages}.html` — visual spec.
- **Verified data contract:** `assets/api-index/DATA-CONTRACT.md` — live-schema corrections that
  OVERRIDE the mockups. Verbatim query bodies live in `assets/api-index/*.md` (per page).
- `assets/` is gitignored (reference material + scratch introspection scripts).

## Architecture rules (non-negotiable)
- **Indexer-vs-fallback (§2):** every detail page + the live badge use `_metadata` via
  `getUseRpcData()` (lag > `INDEXER_LAG_THRESHOLD`=5 or `!indexerHealthy` → LCD/RPC). Always-LCD
  content: tx Messages/Events/Raw, validator Delegators.
- **Caching (§3):** Next fetch cache + ISR only. NO db/snapshot/cron. Per-call `revalidate`.
- **No invented GraphQL fields.** Use the verified queries. `upokt→POKT` via one shared util (÷1e6).
- StakeStatus enum is `Staked/Unstaking/Unstaked` for ALL actors incl. validators (NOT Bonded/Unbonding).

## Layout
- `app/` — routes (App Router, no src dir). `@/*` → project root.
- `components/shell/` — AppBar, Footer, Atmosphere, ThemeToggle, GlobalSearch, ThemeScript, Logo.
- `lib/` — `config.ts` (env), data helpers, format/time utils, queries (added per build step).
- `app/globals.css` — full design system (tokens + primitives) ported from the mockups.

## Design system
- Tokens on `:root`/`[data-theme=dark|light]`; theme toggles the `data-theme` attribute on `<html>`
  (no-flash inline script in layout, persisted to localStorage). Rubik via `next/font`.
- Ambient atmosphere (starfield/glow/rings) on every page; fades in light; off under
  `prefers-reduced-motion`. Reuse the global classes (`.card`, `.tbl`, `.tabs`, `.kv`,
  `.statuspill`, `.pager`, `.stat`/`.sum`, etc.) — match mockup density exactly.

## Dev
- `npm run dev` (Turbopack, port 3000). Env in `.env.local` (see `.env.example`).
- Build order + open items: brief §9 / §14. Validate against live endpoints in-browser per step.
