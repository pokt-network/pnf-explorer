// Service queries (scope expansion — services detail view; not in the original MVP api-index).
// Verified live 2026-06-06 against data.pocket.network/graphql.
//
// "Active" suppliers/applications = those whose owning actor is currently Staked. On chain a
// supplier has ONE SupplierServiceConfig per service, but the indexer holds a few duplicated config
// ids (35 rows among the Staked suppliers' configs on mainnet, measured 2026-10-06: totalCount
// 156,422 vs distinctCount 156,387 — an indexer bug being fixed), so a filtered totalCount can count
// a supplier twice. Counting raw configs would include suppliers that have since unstaked (eth:
// 8746 configs vs 4063 currently Staked).

// List of services (263 on mainnet, measured 2026-10-06), ordered by display name. Active-supplier counts are fetched
// separately (getServiceSummaryList over every service) and cached 12h — see lib/data/services.ts.
export const SERVICES_LIST = /* GraphQL */ `
  query servicesList($limit: Int!, $offset: Int!) {
    services(first: $limit, offset: $offset, orderBy: NAME_ASC) {
      totalCount
      nodes {
        id
        name
        computeUnitsPerRelay
        ownerId
      }
    }
  }
`;

// Active-supplier count of every service, from the service summary function (the closed schema has no
// aggregates or filters through a relation): `stakedSuppliers` counts each Staked supplier once,
// whatever duplicated config ids the indexer holds (see above). One call: a filter on the list would run after the
// function (computing every service again), so lib/data/services.ts refuses an answer that fills the query limit.
export const SERVICE_ACTIVE_SUPPLIER_COUNTS = /* GraphQL */ `
  query serviceSupplierCounts {
    getServiceSummaryList(services: null) {
      serviceId
      stakedSuppliers
    }
  }
`;

// The service, and from the service summary function its supplier/application counts and its current relay-mining
// difficulty (the newest update: EMA, target hash and its height).
export const SERVICE_BY_ID = /* GraphQL */ `
  query serviceById($id: String!) {
    service(id: $id) {
      id
      name
      computeUnitsPerRelay
      ownerId
    }
    summary: getServiceSummaryList(services: [$id]) {
      stakedSuppliers
      suppliers
      stakedApplications
      numRelaysEma
      targetHashHex
      difficultyUpdatedHeight
    }
  }
`;

// Staked suppliers serving the service, largest stake first (fleet function, paged by lib/data/suppliers.ts fleetPage),
// with the root domains of their endpoints for it; the pager's total is the summary's staked count.
export const SERVICE_SUPPLIERS = /* GraphQL */ `
  query serviceSuppliers($id: String!, $rowLimit: Int, $rowOffset: Int) {
    getSupplierFleetList(
      services: [$id]
      stakeStatuses: ["Staked"]
      rowLimit: $rowLimit
      rowOffset: $rowOffset
    ) {
      supplierId
      stakeUpokt
      stakeStatus
      serviceDomains
    }
    summary: getServiceSummaryList(services: [$id]) {
      stakedSuppliers
    }
  }
`;

// Staked applications of the service, largest stake first (fleet function); the pager's total is the summary's.
export const SERVICE_APPLICATIONS = /* GraphQL */ `
  query serviceApplications($id: String!, $limit: Int!, $offset: Int!) {
    getApplicationFleetList(services: [$id], stakeStatuses: ["Staked"], first: $limit, offset: $offset) {
      applicationId
      stakeUpokt
      stakeStatus
    }
    summary: getServiceSummaryList(services: [$id]) {
      stakedApplications
    }
  }
`;

// Relay-mining difficulty history, newest first: the function skips `rowOffset` rows of its order and lists the next
// `rowLimit` (at most 1000), so a page at any depth is one call.
export const SERVICE_DIFFICULTY = /* GraphQL */ `
  query serviceDifficulty($id: String!, $rowLimit: Int!, $rowOffset: Int!) {
    getRelayMiningDifficultyList(services: [$id], rowLimit: $rowLimit, rowOffset: $rowOffset, first: $rowLimit) {
      height
      serviceId
      prevNumRelaysEma
      newNumRelaysEma
      newTargetHashHex
    }
  }
`;
