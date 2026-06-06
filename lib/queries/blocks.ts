// Block queries — verbatim from assets/api-index/{list-blocks,detail-block}.md.

export const BLOCK_LIST = /* GraphQL */ `
  query blockList($limit: Int!, $offset: Int!) {
    blocks(first: $limit, offset: $offset, orderBy: ID_DESC) {
      nodes {
        height: id
        hash
        timestamp
        totalTxs
        timeToBlock
        successfulTxs
        stakedApps
        stakedSuppliers
        stakedGateways
        totalRelays
        totalComputedUnits
        proposerAddress
        size
        supplies {
          nodes {
            supply {
              denom
              amount
            }
          }
        }
      }
      totalCount
    }
  }
`;

export const BLOCK_SUMMARY = /* GraphQL */ `
  query blockSummary($startDate: Datetime!, $endDate: Datetime!) {
    avgs: blocks(
      filter: { timestamp: { greaterThanOrEqualTo: $startDate, lessThanOrEqualTo: $endDate } }
      orderBy: ID_DESC
      first: 1
    ) {
      nodes {
        height: id
        totalTxs
      }
      aggregates {
        average {
          timeToBlock
          size
        }
      }
    }
  }
`;

export const BLOCK_BY_HEIGHT = /* GraphQL */ `
  query blockByHeight($height: BigFloat!) {
    block(id: $height) {
      hash
      height: id
      timestamp
      totalTxs
      timeToBlock
      successfulTxs
      stakedApps
      stakedSuppliers
      stakedGateways
      totalRelays
      totalComputedUnits
      proposerAddress
      stakedAppsTokens
      stakedSuppliersTokens
      stakedGatewaysTokens
      size
      supplies {
        nodes {
          supply {
            denom
            amount
          }
        }
      }
      metadata {
        header
        lastCommit
        blockId
      }
    }
  }
`;

export const BLOCK_BY_HASH = /* GraphQL */ `
  query blockByHash($hash: String!) {
    blocks(filter: { hash: { equalTo: $hash } }, first: 1) {
      nodes {
        height: id
        hash
        timestamp
        totalTxs
        timeToBlock
        successfulTxs
        stakedApps
        stakedSuppliers
        stakedGateways
        totalRelays
        totalComputedUnits
        proposerAddress
        stakedAppsTokens
        stakedSuppliersTokens
        stakedGatewaysTokens
        size
        supplies {
          nodes {
            supply {
              denom
              amount
            }
          }
        }
        metadata {
          header
          lastCommit
          blockId
        }
      }
    }
  }
`;
