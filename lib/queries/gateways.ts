// Gateway list query (post-MVP scope expansion). Only 8 gateways; show all with a status pill.
// id is the gateway's pokt1 address (links to /account).

export const GATEWAYS_LIST = /* GraphQL */ `
  query gatewaysList($limit: Int!, $offset: Int!) {
    gateways(first: $limit, offset: $offset, orderBy: STAKE_AMOUNT_DESC) {
      totalCount
      nodes {
        id
        stakeAmount
        stakeStatus
      }
    }
  }
`;
