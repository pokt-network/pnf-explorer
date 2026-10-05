// Block queries — verbatim from assets/api-index/{list-blocks,detail-block}.md.

export const BLOCK_LIST = /* GraphQL */ `
  query blockList($limit: Int!, $offset: Int!, $withCount: Boolean = true) {
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
        # Aliased to the ESTIMATED (relay-mining difficulty-scaled) fields so relays/CU match the
        # ecosystem-standard throughput shown by PoktScan; on-chain "claimed" totals are ~2.5x lower.
        totalRelays: totalEstimatedRelays
        totalComputedUnits: totalEstimatedComputedUnits
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
      # A count over every block: skipped where the total is not shown.
      totalCount @include(if: $withCount)
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
        sum {
          totalTxs
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
      # Aliased to the ESTIMATED (difficulty-scaled) fields — see BLOCK_LIST note.
      totalRelays: totalEstimatedRelays
      totalComputedUnits: totalEstimatedComputedUnits
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
        # Aliased to the ESTIMATED (relay-mining difficulty-scaled) fields so relays/CU match the
        # ecosystem-standard throughput shown by PoktScan; on-chain "claimed" totals are ~2.5x lower.
        totalRelays: totalEstimatedRelays
        totalComputedUnits: totalEstimatedComputedUnits
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
