// Service queries (scope expansion — services detail view; not in the original MVP api-index).
// Verified live 2026-06-06 against data.pocket.network/graphql.
//
// "Active" suppliers/applications = those whose owning actor is currently Staked. Each supplier
// has exactly ONE SupplierServiceConfig per service (distinctCount == totalCount), so a filtered
// totalCount IS the distinct active count — no dedup needed. Counting raw configs would include
// suppliers that have since unstaked (eth: 8746 configs vs 4063 currently Staked).

// List of services (173 total), ordered by display name. Active-supplier counts are fetched
// separately (one aliased batch query) and cached 12h — see lib/data/services.ts.
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
