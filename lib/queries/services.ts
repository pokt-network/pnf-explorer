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

// Active-supplier count of every service in one statement: `distinctCount { id }` counts the
// group's distinct config ids. It equals the per-service filtered `totalCount` except where the
// indexer duplicated a config id (see above): there it counts the supplier once, totalCount twice.
export const SERVICE_ACTIVE_SUPPLIER_COUNTS = /* GraphQL */ `
  query serviceSupplierCounts {
    supplierServiceConfigs(filter: { supplier: { stakeStatus: { equalTo: Staked } } }) {
      groupedAggregates(groupBy: SERVICE_ID) {
        keys
        distinctCount {
          id
        }
      }
    }
  }
`;

export const SERVICE_BY_ID = /* GraphQL */ `
  query serviceById($id: String!) {
    service(id: $id) {
      id
      name
      computeUnitsPerRelay
      ownerId
      owner {
        id
      }
      latestDiff: relayMiningDifficultyUpdatedEvents(orderBy: BLOCK_ID_DESC, first: 1) {
        nodes {
          newNumRelaysEma
          newTargetHashHexEncoded
          blockId
        }
      }
    }
    activeSuppliers: supplierServiceConfigs(
      filter: { serviceId: { equalTo: $id }, supplier: { stakeStatus: { equalTo: Staked } } }
    ) {
      totalCount
    }
    totalSuppliers: supplierServiceConfigs(filter: { serviceId: { equalTo: $id } }) {
      totalCount
    }
    activeApps: applicationServices(
      filter: { serviceId: { equalTo: $id }, application: { stakeStatus: { equalTo: Staked } } }
    ) {
      totalCount
    }
  }
`;

export const SERVICE_SUPPLIERS = /* GraphQL */ `
  query serviceSuppliers($id: String!, $limit: Int!, $offset: Int!) {
    supplierServiceConfigs(
      filter: { serviceId: { equalTo: $id }, supplier: { stakeStatus: { equalTo: Staked } } }
      first: $limit
      offset: $offset
    ) {
      totalCount
      nodes {
        supplierId
        domains
        endpoints
        supplier {
          stakeAmount
          stakeStatus
        }
      }
    }
  }
`;

export const SERVICE_APPLICATIONS = /* GraphQL */ `
  query serviceApplications($id: String!, $limit: Int!, $offset: Int!) {
    applicationServices(
      filter: { serviceId: { equalTo: $id }, application: { stakeStatus: { equalTo: Staked } } }
      first: $limit
      offset: $offset
    ) {
      totalCount
      nodes {
        applicationId
        application {
          stakeAmount
          stakeStatus
        }
      }
    }
  }
`;

export const SERVICE_DIFFICULTY = /* GraphQL */ `
  query serviceDifficulty($id: String!, $limit: Int!, $offset: Int!) {
    service(id: $id) {
      relayMiningDifficultyUpdatedEvents(orderBy: BLOCK_ID_DESC, first: $limit, offset: $offset) {
        totalCount
        nodes {
          blockId
          prevNumRelaysEma
          newNumRelaysEma
          newTargetHashHexEncoded
        }
      }
    }
  }
`;
