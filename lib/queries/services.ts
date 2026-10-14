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
// separately (one grouped query) and cached 12h — see lib/data/services.ts.
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
// whatever duplicated config ids the indexer holds (see above). Paged by keyset: the services after `after`.
export const SERVICE_ACTIVE_SUPPLIER_COUNTS = /* GraphQL */ `
  query serviceSupplierCounts($after: String!) {
    getServiceSummaryList(services: null, filter: { serviceId: { greaterThan: $after } }) {
      serviceId
      stakedSuppliers
    }
  }
`;

// The service, its supplier/application counts (service summary function) and its current relay-mining difficulty
// (the newest update).
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
    }
    latestDiff: getRelayMiningDifficultyList(services: [$id], rowLimit: 1) {
      height
      newNumRelaysEma
      newTargetHashHex
    }
  }
`;

// Staked suppliers serving the service, largest stake first (fleet function); the pager's total is the summary's
// staked count. Their endpoints come from SERVICE_SUPPLIER_CONFIGS over the page's ids.
export const SERVICE_SUPPLIERS = /* GraphQL */ `
  query serviceSuppliers($id: String!, $limit: Int!, $offset: Int!) {
    getSupplierFleetList(services: [$id], stakeStatuses: ["Staked"], first: $limit, offset: $offset) {
      supplierId
      stakeUpokt
      stakeStatus
    }
    summary: getServiceSummaryList(services: [$id]) {
      stakedSuppliers
    }
  }
`;

export const SERVICE_SUPPLIER_CONFIGS = /* GraphQL */ `
  query serviceSupplierConfigs($id: String!, $ids: [String!]) {
    supplierServiceConfigs(filter: { serviceId: { equalTo: $id }, supplierId: { in: $ids } }) {
      nodes {
        supplierId
        domains
        endpoints
      }
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

// Relay-mining difficulty history, newest first: the function lists at most `rowLimit` (1000) rows per call, from the
// row before `beforeHeight`/`beforeServiceId` on; `first`/`offset` page inside them.
export const SERVICE_DIFFICULTY = /* GraphQL */ `
  query serviceDifficulty($id: String!, $rowLimit: Int!, $beforeHeight: BigInt, $beforeServiceId: String, $limit: Int!, $offset: Int!) {
    getRelayMiningDifficultyList(
      services: [$id]
      rowLimit: $rowLimit
      beforeHeight: $beforeHeight
      beforeServiceId: $beforeServiceId
      first: $limit
      offset: $offset
    ) {
      height
      serviceId
      prevNumRelaysEma
      newNumRelaysEma
      newTargetHashHex
    }
  }
`;
