# Role views — making the actor, not the wallet, the primary axis

**Status:** design + build (2026-08-19). Supersedes the "role-additive sections" model in
`ACCOUNT-PAGE-DATA-DESIGN.md` §4, which this doc replaces for presentation; that doc's role
taxonomy (§1) and identity traps stay authoritative.

All field/shape claims below were verified live against `data.pocket.network` (indexer) and
`sauron-api.infra.pocket.network` (LCD) on 2026-08-19.

---

## 1. The problem

Reported by a node operator, 2026-07-08:

> "the explorer keeps without tell me the right story I expect to see on a supplier … the raw does
> not give me the raw of the supplier as I ask … the revshare does not show the 99% of the owner,
> only shows the 1% of the supplier … supplier is a 100% separated actor with his own state
> independent of the state of the account … I took a supplier and try to figure it out which are
> the services, which are the url of each and how is distributed the revshare on it — was not able
> to see that unless I navigate through at least 3 pages"

Three concrete defects, one root cause.

| Symptom | Cause |
|---|---|
| Raw shows the wallet, never the supplier | The Raw tab is hard-wired to `profile.account` (balances only). One address = one Raw panel. |
| Rev-share shows 1%, not the 99% | **Two different things are both named "Rev-share".** The *Services* tab renders the supplier's own split correctly (1% + 99%); the *Rev-share* tab is the reverse lookup ("configs that pay THIS address"), whose only column is this address's own cut. He clicked the tab named after what he wanted. |
| 3 pages to see services + URLs + rev-share | Config data is in one table, but **earnings** (what each party actually got paid) exist nowhere, and the page identity is "Account" with role chips appended — it reads as a wallet, not an actor. |

Root cause: `/account/{addr}` renders one *account* identity and appends role-flavoured tabs. The
protocol's actors are independent state machines that merely share an address. The page must make
**role the primary axis** and the account just one of the roles.

## 2. URL + navigation model

- `/account/{addr}` stays canonical. The active role is a server-read search param: **`?as=<role>`**.
- `?tab=` keeps its current meaning but is now **scoped inside the active role**.
- Role switching is a real navigation (`<Link>`), not client tab state — so each role fetches only
  its own data. Switching roles drops `tab` and all paging params.
- Aliases matching the URLs users paste from PoktScan redirect into the role view:
  `/supplier/{addr}` → `/account/{addr}?as=supplier`, likewise `/application`, `/gateway`.
- Default role when `?as=` is absent — the most specific role the address holds:
  `supplier → owner → application → gateway → validator → service → account`.
  A plain wallet still lands on `account`, unchanged.
- Unknown/unheld `?as=` value falls back to the default rather than 404ing.

The role rail renders as a distinct control **above** the tab bar (pill/segmented, one entry per
held role with a one-glance stat) so it never reads as a second row of tabs.

`validator` is a rail entry that links out to the existing `/validator/{valoper}` page rather than
duplicating it.

## 3. Per-role data contract

`I` = GraphQL indexer, `L` = Cosmos LCD, `D` = derived. Every query below is verified.

### 3.1 Supplier — operator (`?as=supplier`)

Header stats: stake · status · owner (link or "self") · lifetime relays · lifetime earned.

| Tab | Content | Source |
|---|---|---|
| **Services** | One row per configured service: serviceId, endpoint URL(s), RPC type, rev-share split (owner/operator annotated), **plus that service's settled relays + earnings** | I `supplier.serviceConfigs` + `eventClaimSettleds.groupedAggregates(groupBy:[SERVICE_ID])` |
| **Traffic** | Configured-vs-served, routing gateway inference (existing panel) | I |
| **Earnings** | Payout ledger: per-recipient totals and per-reason breakdown | I `modToAcctTransfers` |
| **History** | Stake changes (`stakeMsgs`), unstake msgs, slashes with penalty + before/after stake | I |
| **Raw** | The **supplier** record | L `/pokt-network/poktroll/supplier/supplier/{addr}` |

**Configured ≠ served.** `pokt1w8mta…` has 3 configured services but settled claims across 32
(avax, arb-one, fantom…) from earlier configurations. The Services tab is current config; the
per-service rollup is joined on top and surfaces historical-only services separately.

### 3.2 Supplier — owner (`?as=owner`)

| Tab | Content | Source |
|---|---|---|
| **Operators** | Paginated fleet: operator, status, stake, #services (existing panel) | I `suppliers(ownerId==addr)` |
| **Earnings** | Fleet rollup: relays, claimed, settled — grouped by operator | I (see caveat 5.1) |

No LCD record exists for "owner" as such, so no Raw tab.

### 3.3 Application (`?as=application`)

Header: stake · status · #services · #delegated gateways · lifetime relays · **spend**.

| Tab | Content | Source |
|---|---|---|
| **Services** | `applicationServices` + per-service relays/spend | I |
| **Delegated Gateways** | existing panel | I |
| **Usage** | settled claims: relays, claimed/settled amount (this is *spend*, not earnings) | I `eventClaimSettleds(applicationId)` |
| **Raw** | The **application** record, incl. LCD-only `pending_undelegations`, `per_session_spend_limit`, `service_config_history` | L `/pokt-network/poktroll/application/application/{addr}` |

Also surfaced in the header when live: the app→app **transfer** lifecycle
(`transferringToId` / `transferEndHeight`), which is distinct from unstaking.

### 3.4 Gateway (`?as=gateway`)

| Tab | Content | Source |
|---|---|---|
| **Delegating Apps** | existing panel | I |
| **Traffic** | **Routed traffic** — delegating apps → their settled claims, grouped by service | I+D |
| **Raw** | The **gateway** record | L `/pokt-network/poktroll/gateway/gateway/{addr}` |

Verified for `pokt1l5e05…`: 25 delegating apps → 5.85M relays / 8,562 POKT claimed. This view does
not exist today at all.

### 3.5 Service owner (`?as=service`) / Rev-share income (`?as=revshare`)

- **Service owner:** owned services with compute-units-per-relay, staked-supplier count, app count.
- **Rev-share income:** the reverse lookup, renamed so it can no longer be confused with a
  supplier's own split — and carrying **amounts actually received**, not just percentages.

## 4. The payout ledger (the missing primitive)

`EventClaimSettled.modToAcctTransfers` records every mod→account settlement transfer:
`{ opReason, recipientId, amount, denom }`. For `pokt1w8mta…`:

- `pokt1lh9lp…` (99%) → **2,271 POKT** over 4,512 transfers
- `pokt1w8mta…` (1%, operator) → **34.5 POKT** over 6,050 transfers

This converts rev-share from a static percentage table into "here is what each party actually
earned", which is what the report is really asking for.

It also exposes what a current-state view structurally cannot: owner `pokt1zqpjdpq…` appears in
**zero** rev-share configs today yet has received 2,291 POKT of `SUPPLIER_SHAREHOLDER_RD` (1,248 of
it from this one supplier). The config changed. **Percentages are current state; payouts are
history.** Both must be shown — the Earnings tab therefore lists *every* address the supplier has
ever paid (606 of them for `pokt1w8mta…`, paginated, largest first) and flags which are on the
current config.

## 5. Caveats (learned the hard way while probing)

1. **`supplierOwnerId` is sparsely populated** — present on only 1,315 of 5,296 claim events for
   `pokt1w8mta…` (~25%; it is a newer field). Owner rollups MUST go through the fleet's supplier
   ids (`supplierId: { in: [...] }`), never `supplierOwnerId`. Verified: the id-list path returns
   5.0M relays vs 244K via `supplierOwnerId`.
2. **Unfiltered `modToAcctTransfers` aggregates hit the Postgres statement timeout.** Always
   constrain by the parent claim (`eventClaimSettled: { supplierId: ... }`) first.
3. **`groupedAggregates` DOES respect nested-relation filters** — an early reading suggested
   otherwise, but it reconciles exactly: for `pokt1w8mta…`, `groupBy:[RECIPIENT_ID]` under a
   supplier filter returns 606 groups whose `distinctCount` sums to the connection's `totalCount`
   (497,142) and whose amounts sum to the connection's total (4,050 POKT). The 606 recipients are
   real — this supplier served 32 services under changing rev-share configs. Prefer the single
   grouped query (~3s) over N aliased per-recipient queries (~5s for 4).
4. `revShare: { contains: [{ address }] }` JSON containment works correctly in both directions.
5. `in:` filters are capped by the connection limit — cap fleet rollups at 100 ids and label the
   result as covering the first N operators when truncated.
6. Settlement amounts are `0` on older claim rows while `claimedAmount` is populated; show claimed
   and settled as distinct columns rather than implying one from the other.

## 6. Three-S notes

- **Scalability:** role-scoped fetching means a 98-operator owner wallet never pays for supplier
  service-config queries. Every per-role list stays paginated; fleet rollups are capped and labelled.
- **Security/provenance:** Raw panels are LCD-sourced per role and carry the gold provenance strip.
  Routing/gateway attribution stays labelled as inference (the signing gateway is not on-chain).
- **Sustainability:** one `ROLE` registry drives the rail, the default-role ranking, the alias
  routes and the per-role tab sets, so adding a future actor type is one entry plus its panels.
