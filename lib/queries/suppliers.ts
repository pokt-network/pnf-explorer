// Supplier list query (post-MVP scope expansion). Suppliers list shows ACTIVE (Staked) only —
// there are 10,808 supplier records but ~4,082 currently staked; the rest are long-unstaked noise.
// id is the operator pokt1 address (links to /account). serviceConfigs.totalCount = # services served.

export const SUPPLIERS_LIST = /* GraphQL */ `
  query suppliersList($limit: Int!, $offset: Int!) {
    suppliers(
      filter: { stakeStatus: { equalTo: Staked } }
      first: $limit
      offset: $offset
      orderBy: STAKE_AMOUNT_DESC
    ) {
      totalCount
      nodes {
        id
        ownerId
        stakeAmount
        stakeStatus
        serviceConfigs {
          totalCount
        }
      }
    }
  }
`;
