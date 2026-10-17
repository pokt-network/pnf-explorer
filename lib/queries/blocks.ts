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
  query blockByHeight($height: BigFloat!, $supplyHeight: BigInt!) {
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
    # The metadata record and supply rows ride along: a failure on them leaves the block (gqlFetch partial).
    metadata: getBlockMetadataList(height: $supplyHeight) {
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
    metadata: getBlockMetadataList(hash: $hash) {
      header
      lastCommit
      blockId
    }
    supplies: getBlockSuppliesList(hash: $hash) {
      denom
      amount
    }
  }
`;

// The supply in force at a block (getBlockSuppliesList: one row per denom with its amount).
export const BLOCK_SUPPLIES = /* GraphQL */ `
  query blockSupplies($height: BigInt!) {
    supplies: getBlockSuppliesList(height: $height) {
      denom
      amount
    }
  }
`;
