// Role-view queries (ROLE-VIEWS-DESIGN.md §3). Each actor an address can be — supplier operator,
// supplier owner, application, gateway, service owner, rev-share recipient — is an independent
// state machine with its own read set. These queries are fetched ONLY for the active role, so a
// 98-operator owner wallet never pays for supplier service-config work.
//
// Verified live against data.pocket.network (poktroll v0.1.34) on 2026-08-19. Moved to the indexer's closed schema
// (no relations, aggregates or event tables) on 2026-10-14: sums come from the settlement catalog functions, which
// answer {range, data} — the rows plus the span they cover.

// ---- supplier (operator) ----
// One round-trip for the whole supplier role: current config (services/endpoints/rev-share) AND
// the lifetime settlement rollup per service from the settlement catalog, so the Services tab can
// show "configured for X, earned Y on it" in a single table (the report's "3 pages to build a mental
// map" complaint). Slashes are the penalties function's `slashed` rows.
//
// NOTE the per-service rows cover every service the supplier has EVER settled a claim on, which is a
// superset of the currently-configured ones (pokt1w8mta…: 3 configured, 32 settled). The UI joins on
// serviceId and renders the leftovers as "no longer configured".
export const SUPPLIER_ROLE = /* GraphQL */ `
  query supplierRole($id: String!, $ids: [String]) {
    supplier(id: $id) {
      id
      operatorId
      ownerId
      stakeAmount
      stakeDenom
      stakeStatus
      unstakingReason
      unstakingBeginBlockId
      unstakingEndHeight
    }
    serviceConfigs: supplierServiceConfigs(filter: { supplierId: { equalTo: $id } }) {
      totalCount
      nodes {
        serviceId
        revShare
        endpoints
      }
    }
    settled: getSupplierEarningsJson(suppliers: $ids, rangeStart: null, rangeEnd: null, bySupplier: false, byService: true)
    penalties: getSupplierPenaltiesJson(suppliers: $ids, rangeStart: null, rangeEnd: null, bySupplier: false)
  }
`;

// Payout ledger: everything this supplier's settled claims paid out, by recipient (settlement catalog). This is
// the ACTUAL earnings split, as opposed to the configured rev-share percentages — the two diverge whenever the
// config has changed (see design doc §4). The stakers' share comes as one row (`recipient_id` 'all').
export const SUPPLIER_PAYOUTS = /* GraphQL */ `
  query supplierPayouts($ids: [String]) {
    getSupplierDistributionJson(suppliers: $ids, rangeStart: null, rangeEnd: null, bySupplier: false)
  }
`;

// Supplier lifecycle: stake and unstake messages and slashes, newest first (one list per kind, each at most
// `rowLimit` rows). Powers the History tab.
export const SUPPLIER_HISTORY = /* GraphQL */ `
  query supplierHistory($ids: [String], $rowLimit: Int!) {
    stakeMsgs: getActorLifecycleList(kind: "supplier", addresses: $ids, events: ["stake"], rowLimit: $rowLimit) {
      id
      height
      stakeUpokt
      transactionId
    }
    unstakeMsgs: getActorLifecycleList(kind: "supplier", addresses: $ids, events: ["unstake"], rowLimit: $rowLimit) {
      id
      height
      transactionId
    }
    slashes: getActorLifecycleList(kind: "supplier", addresses: $ids, events: ["slash"], rowLimit: $rowLimit) {
      id
      height
      serviceId
      penaltyUpokt
      previousStakeUpokt
      stakeUpokt
      proofValidationStatus
    }
  }
`;

// ---- supplier owner (fleet) ----
// The fleet's earnings come from the settlement catalog's `owners` (every supplier the owner owns now); the ids
// (capped at the connection limit) only pick the operators listed. Never `supplierOwnerId` on claim events — a newer
// field present on only ~25% of rows (1,315 of 5,296 for pokt1w8mta…), which silently under-reports by 20×.
export const OWNER_FLEET_IDS = /* GraphQL */ `
  query ownerFleetIds($id: String!, $limit: Int!) {
    suppliers(filter: { ownerId: { equalTo: $id } }, first: $limit, orderBy: STAKE_AMOUNT_DESC) {
      totalCount
      nodes {
        id
      }
    }
  }
`;

// Lifetime earnings of every supplier the owner owns now, from the settlement catalog: one total, per supplier, or per
// service (bySupplier: false, byService: true). Read as two requests (per supplier, per service) so they run in parallel;
// the totals are the per-service rows summed.
export const FLEET_EARNINGS = /* GraphQL */ `
  query fleetEarnings($owners: [String], $bySupplier: Boolean, $byService: Boolean) {
    getSupplierEarningsJson(suppliers: null, rangeStart: null, rangeEnd: null, bySupplier: $bySupplier, byService: $byService, owners: $owners)
  }
`;

// ---- application ----
// Claim amounts on an application are SPEND (stake burned to pay suppliers), not income. The spend
// per service comes from the settlement catalog (burned, overserviced and unpaid, last settled height).
export const APPLICATION_ROLE = /* GraphQL */ `
  query applicationRole($id: String!, $ids: [String]) {
    application(id: $id) {
      id
      stakeAmount
      stakeDenom
      stakeStatus
      unstakingReason
      unstakingBeginBlockId
      unstakingEndHeight
      transferringToId
      transferEndHeight
      sourceApplicationId
      destinationApplicationId
    }
    services: applicationServices(filter: { applicationId: { equalTo: $id } }) {
      totalCount
      nodes {
        serviceId
      }
    }
    gateways: applicationGateways(filter: { applicationId: { equalTo: $id } }) {
      totalCount
    }
    spend: getApplicationSpendJson(applications: $ids, rangeStart: null, rangeEnd: null, byApplication: false, byService: true)
  }
`;

// ---- gateway ----
// A gateway signs relays but is NOT recorded on any claim/relay/proof, so its traffic is derived:
// the settled claims of the apps delegated to it — by the delegation in force at each settlement
// height (getGatewaySpend), not by today's delegators. Same authorized-routing inference the
// supplier Traffic tab uses, in the opposite direction.
export const GATEWAY_ROLE = /* GraphQL */ `
  query gatewayRole($id: String!, $ids: [String]) {
    gateway(id: $id) {
      id
      stakeAmount
      stakeDenom
      stakeStatus
      unstakingBeginBlockId
      unstakingEndHeight
    }
    # The applications delegating to it now and the delegate/undelegate messages it ever received, from the gateway
    # fleet function.
    fleet: getGatewayFleetList(gateways: $ids) {
      delegatedApplications
      delegationsEver
      undelegationsEver
    }
  }
`;

export const GATEWAY_TRAFFIC = /* GraphQL */ `
  query gatewayTraffic($ids: [String]) {
    getGatewaySpendJson(gateways: $ids, rangeStart: null, rangeEnd: null, byGateway: false, byService: true)
  }
`;

// ---- service owner ----
// Paginated: the PNF service-owner wallet owns 138 services, well past a sane inline list. The page's supplier and
// application counts come from the service summary function (SERVICE_OWNER_COUNTS).
export const SERVICE_OWNER_ROLE = /* GraphQL */ `
  query serviceOwnerRole($id: String!, $limit: Int!, $offset: Int!) {
    services(filter: { ownerId: { equalTo: $id } }, orderBy: ID_ASC, first: $limit, offset: $offset) {
      totalCount
      nodes {
        id
        name
        computeUnitsPerRelay
      }
    }
  }
`;

export const SERVICE_OWNER_COUNTS = /* GraphQL */ `
  query serviceOwnerCounts($services: [String]) {
    getServiceSummaryList(services: $services) {
      serviceId
      suppliers
      applications
    }
  }
`;

// ---- rev-share income (reverse lookup) ----
// "What has this address actually been paid as a rev-share recipient", lifetime, across every
// supplier that pays it: the income catalog by reason, kept to the `rev_share` role (the address can
// also earn in other roles). `family` is the settlement family: relay (relay burn = mint) or global
// (global mint). Lifetime here is the span the catalog covers (its `range`).
//
// There is no supplier-id join: narrowing to the current page's suppliers put per-page values in the
// fetch cache key, so paginating recomputed the whole aggregate. The figure is a lifetime total,
// which is both cheaper and the more meaningful number.
export const REVSHARE_INCOME_AMOUNTS = /* GraphQL */ `
  query revShareIncomeAmounts($recipients: [String]) {
    getIncomeJson(addresses: $recipients, rangeStart: null, rangeEnd: null, byReason: true, byAddress: false)
  }
`;
