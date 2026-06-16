# Pre-Deployment Checklist — explorer.pocket.network

Resolve before deploying to `explorer.pocket.network` (brief §14, §15).

## ⚠️ Open data questions (verify against the protocol/indexer before deploy)

1. ~~**`_metadata.indexerHealthy` fallback signal**~~ ✅ RESOLVED. On 2026-06-05 this was
   persistently `false` even at lag 0, so the fallback was temporarily keyed on **lag only**.
   Re-verified 2026-06-06: `indexerHealthy` now reports `true` when synced (stable across 5 polls,
   lag 0) — the persistent-false condition has cleared. Per the original §2 design, `indexerHealthy`
   has been **restored** to the rule: `lib/metadata.ts#evaluateFallback` now returns
   `useRpc = !indexerHealthy || lag > INDEXER_LAG_THRESHOLD`. Lag still independently catches a
   stall; an unreachable indexer is forced to RPC by `getUseRpcData()`'s catch.

2. ~~**`validator.minSelfDelegation`** denomination~~ ✅ RESOLVED. The field **is** upokt (base
   units), NOT whole POKT — so the values really are tiny (1–100 upokt). Verified the on-chain LCD
   raw value matches the indexer with no transform (`poktvaloper19h9…wa8su`:
   `min_self_delegation:"100"` on `/cosmos/staking/v1beta1/validators/{valoper}` ≡ indexer
   `minSelfDelegation:100`), and Cosmos SDK staking defines `min_self_delegation` as a `math.Int`
   in the bond-denom base units, compared directly against `validator.Tokens` (upokt). The proposed
   "stop dividing by 1e6" fix would have been wrong. Instead the misleading `formatPokt`→`0.00 POKT`
   (and `formatPoktCompact`→`0` on the list) was replaced with `formatUpokt`→`100 upokt` on the
   validator detail card and the validators-list "Self-Deleg." column.

3. ~~**Validator signer mapping**~~ ✅ RESOLVED. `validatorById.signerId` is the valoper and
   `signer.balances` is empty; the pokt1 operator account is `signerPoktPrefixId` /
   `signerPoktPrefix` (verified: balance 8.0M POKT, 6 txs / 107 transfers vs the valoper's 5 / 0).
   The detail page now uses the operator address for the Signer link, balance, the
   Transactions/Transfers tab filters, and the Delegators self-marking. (The spawned investigation
   task can focus on item 2 below — minSelfDelegation denom — only.)

4. ~~**Validator voting power**~~ ✅ RESOLVED. The indexer's `stakeAmount` is the operator
   SELF-stake only (e.g. `poktvaloper19h9…wa8su`: 1,000 POKT), not the security/voting weight.
   True voting power is the validator's total bonded `tokens` (self-stake + delegations, 3.2M POKT
   for the same validator), which the indexer does not expose — only the Cosmos LCD does
   (`/cosmos/staking/v1beta1/validators[/{valoper}]` → `tokens`). Like Delegators (§2), this is now
   always-LCD: `getBondedTokensMap()` / `getValidatorBondedTokens()` in `lib/data/validators.ts`
   feed the validator detail "Voting Power (Bonded)" card (self-stake kept as a sub-line) and the
   validators-list Voting Power + Share columns, which are now ranked by bonded power. Both fall
   back to `stakeAmount` if the LCD is unreachable.

## Standard deploy steps (brief §14, §5)

- [ ] Set env vars on Vercel: `NEXT_PUBLIC_GRAPHQL_URL`, `SAURON_LCD_URL`, `SAURON_RPC_URL`,
      `NEXT_PUBLIC_INDEXER_LAG_THRESHOLD` (see `.env.example`). Beta TestNet endpoints
      (`*_BETA`) default from `lib/networks.ts` — only set them on Vercel to override.
- [x] `npm run build` passes clean (step 13). Verified 2026-06-06: Next 16.2.7, compiled + TS clean,
      9 static pages generated, exit 0.
- [x] Official PNF logo wired (white on dark / black on light, `public/pocket-logo-*.svg`).
- [x] Generate favicon + OG image from the PNF mark (§14.8). Done 2026-06-06 via next/og metadata
      routes (no new deps): `app/icon.tsx` (64² favicon, white mark on blue tile), `app/apple-icon.tsx`
      (180²), `app/opengraph-image.tsx` (1200×630 social card), `app/manifest.ts` (PWA manifest), all
      driven by the shared `lib/brand.ts` (Pocket mark path + colors). Default starter favicon removed;
      `metadataBase` + OpenGraph/Twitter wired in `app/layout.tsx`. Verified images render (PNG, correct
      dims) on the dev server.
- [ ] Point `explorer.pocket.network` at the Vercel deployment.
- [x] Confirm no excluded pages (§1) shipped. Verified 2026-06-06 against the production route list:
      only `/`, `/account[s]`, `/block[s]`, `/tx[s]`, `/validator[s]`, `/params` — no `/apps`,
      `/gateways`, `/services`, `/suppliers`, `/tools/*`, `/dashboards/*`, or `/migration`.
