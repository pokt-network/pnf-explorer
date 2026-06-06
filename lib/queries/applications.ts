// Application list query (post-MVP scope expansion). ACTIVE only — filter to Staked so the list
// reflects apps currently consuming the network (excludes unstaked apps that still hold a balance).
// id is the app's pokt1 address (links to /account). applicationServices.totalCount = # services.

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
        applicationServices {
          totalCount
        }
      }
    }
  }
`;
