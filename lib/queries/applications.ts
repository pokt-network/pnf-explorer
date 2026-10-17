// Application list query (post-MVP scope expansion). ACTIVE only — filter to Staked so the list
// reflects apps currently consuming the network (excludes unstaked apps that still hold a balance).
// id is the app's pokt1 address (links to /account). One request: the fleet function lists the page (largest stake
// first, then by id) with each application's # of services, and the plain list gives the total.

export const APPLICATIONS_LIST = /* GraphQL */ `
  query applicationsList($limit: Int!, $offset: Int!) {
    getApplicationFleetList(stakeStatuses: ["Staked"], first: $limit, offset: $offset) {
      applicationId
      stakeUpokt
      stakeStatus
      serviceCount
    }
    applications(filter: { stakeStatus: { equalTo: Staked } }) {
      totalCount
    }
  }
`;
