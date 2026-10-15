// Block queries — from assets/api-index/{list-blocks,detail-block}.md, without the nested relations (`supplies`,
// `metadata`) the indexer's closed schema drops: those are read as their own entities below.

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
      }
      # A count over every block: skipped where the total is not shown.
      totalCount @include(if: $withCount)
    }
  }
`;

export const BLOCK_SUMMARY = /* GraphQL */ `
  query blockSummary($rangeStart: Datetime!, $rangeEnd: Datetime!) {
    latest: blocks(orderBy: ID_DESC, first: 1) {
      nodes {
        height: id
      }
    }
    # Sums and averages over the window come from the block statistics function, not block aggregates.
    stats: getBlockStatsJson(rangeStart: $rangeStart, rangeEnd: $rangeEnd)
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
      }
    }
  }
`;

// A block's metadata record and the supply in force at it (getBlockSuppliesList: one row per denom with its amount).
// `$supplyHeight` is the same height, typed for the function.
export const BLOCK_EXTRAS = /* GraphQL */ `
  query blockExtras($height: BigFloat!, $supplyHeight: BigInt!) {
    metadata: blockMetadatum(id: $height) {
      header
      lastCommit
      blockId
    }
    supplies: getBlockSuppliesList(height: $supplyHeight) {
      denom
      amount
    }
  }
`;

// The timestamp of each height asked for: a list row carries its block's height, not the block.
export const BLOCK_TIMES = /* GraphQL */ `
  query blockTimes($heights: [BigFloat!]!, $limit: Int!) {
    blocks(filter: { id: { in: $heights } }, first: $limit) {
      nodes {
        height: id
        timestamp
      }
    }
  }
`;
