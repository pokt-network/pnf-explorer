# Pre-Deployment Checklist — explorer.pocket.network

Resolve before deploying to `explorer.pocket.network` (brief §14, §15).

## ⚠️ Open data questions (verify against the protocol/indexer before deploy)

1. **`_metadata.indexerHealthy` is persistently `false`** on the live indexer
   (`data.pocket.network`) even when lag is 0 and data is current (verified across polls
   2026-06-05). The explorer therefore keys the indexer-vs-RPC fallback on **lag only**
   (`targetHeight - lastProcessedHeight > INDEXER_LAG_THRESHOLD`), not on `indexerHealthy`
   (see `lib/metadata.ts#evaluateFallback`). **Confirm** this is acceptable, or investigate why
   the indexer self-reports unhealthy — if `indexerHealthy` is meant to be authoritative, the
   fallback rule should be restored to include it.

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
      `NEXT_PUBLIC_INDEXER_LAG_THRESHOLD` (see `.env.example`).
- [ ] `npm run build` passes clean (step 13).
- [x] Official PNF logo wired (white on dark / black on light, `public/pocket-logo-*.svg`).
- [ ] Generate favicon + OG image from the PNF mark (§14.8) — header logo done.
- [ ] Point `explorer.pocket.network` at the Vercel deployment.
- [ ] Confirm no excluded pages (§1) shipped.
