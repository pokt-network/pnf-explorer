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
  This governs how you READ the indexer. It is NOT what validators render — see below.
- **Validator status is chain-derived, never indexer-derived.** Cosmos bonds only the top
  `max_validators` by stake, so everyone below the cut is `BOND_STATUS_UNBONDED` with their
  delegations fully intact. The indexer's StakeStatus collapses that onto "Unstaked", which reads as
  "the operator withdrew" and files healthy candidates alongside validators jailed for downtime.
  Render validators via `deriveValidatorState()` (lib/validator.ts) over
  `getValidatorChainStates()` (LCD `status` + `jailed` + `tokens`), which yields
  **Active / Inactive / Leaving / Jailed / Removed**. Three traps it encodes:
  - `jailed` is orthogonal to `status` and must be tested FIRST.
  - `UNBONDING` is not necessarily a voluntary exit — a validator out-staked out of the set also
    unbonds, hence the intent-neutral "Leaving".
  - Absence from the LCD means "dropped from the staking store" ONLY if the read succeeded; on
    failure the state is `unknown` and falls back to the indexer enum. Never let one failed LCD
    call relabel the set as Removed.
- **Voting power belongs to the active set alone.** Share/voting-power figures divide by
  `bondedTotalUpokt` (== the chain's `pool.bonded_tokens`), and non-active validators show no
  share — a percentage there would imply consensus weight they do not have.
- **Never hardcode `max_validators`** (21 on mainnet as of 2026-09) or any other governance param.
  It moves by proposal; read it from `/cosmos/staking/v1beta1/params`.

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
- Validator state pills ramp green → yellow-green → yellow → orange → red by distance from
  producing blocks: `.s-active` (mint) · `.s-inactive` (lime) · `.s-leaving` (gold) ·
  `.s-jailed` (orange) · `.s-removed` (coral). `--lime`/`--orange` exist only to make that ramp
  even. Other actors keep `.s-ok`/`.s-unstk`/`.s-fail`.

## Dev
- `npm run dev` (Turbopack, port 3000). Env in `.env.local` (see `.env.example`).
- Build order + open items: brief §9 / §14. Validate against live endpoints in-browser per step.
