// Application list query (post-MVP scope expansion). ACTIVE only — filter to Staked so the list
// reflects apps currently consuming the network (excludes unstaked apps that still hold a balance).
// id is the app's pokt1 address (links to /account). The # of services is APPLICATION_SERVICE_COUNTS.

export const APPLICATIONS_LIST = /* GraphQL */ `
  query applicationsList($limit: Int!, $offset: Int!) {
    applications(
      filter: { stakeStatus: { equalTo: Staked } }
      first: $limit
      offset: $offset
      orderBy: STAKE_AMOUNT_DESC
    ) {
      totalCount
      nodes {
        id
        stakeAmount
        stakeStatus
      }
    }
  }
`;

// The # of services each listed application is staked for (up to 200 ids), from the fleet function: the closed
// schema has no nested `applicationServices { totalCount }`.
export const APPLICATION_SERVICE_COUNTS = /* GraphQL */ `
  query applicationServiceCounts($ids: [String]) {
    getApplicationFleetList(applications: $ids) {
      applicationId
      serviceCount
    }
  }
`;
