// Application list query (post-MVP scope expansion). Shows all applications with a status pill
// (only 171 total, so no need to pre-filter). id is the app's pokt1 address (links to /account).
// applicationServices.totalCount = # services the app is staked for.

export const APPLICATIONS_LIST = /* GraphQL */ `
  query applicationsList($limit: Int!, $offset: Int!) {
    applications(first: $limit, offset: $offset, orderBy: STAKE_AMOUNT_DESC) {
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
