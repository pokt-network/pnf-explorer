// Home summary — the non-chart subset of the verified `summary` query (home.md §6): economic
// total supply + latest-block staked-actor counts + 24h relay/CU aggregates.
//
// Total supply is the indexer's `getTotalSupplyByDay.total_supply` = minted Shannon supply PLUS
// claimable-but-unminted balances (valid Morse claims that can be minted on Shannon at any time).
// This is the figure exchanges/traders expect (matches PoktScan/pokt.money). The last block's supply
// rows are read only as a fallback (the already-minted `shannon_supply` slice; lib/data/home.ts).
export const HOME_SUMMARY = /* GraphQL */ `
  query homeSummary($last24HourDate: Datetime!, $currentDate: Datetime!, $supplyStartDate: Datetime!, $supplyEndDate: Datetime!) {
    supply: getTotalSupplyByDay(startDate: $supplyStartDate, endDate: $supplyEndDate)
    lastBlock: blocks(orderBy: ID_DESC, first: 1) {
      nodes {
        height: id
        totalTxs
        timestamp
        totalRelays
        totalComputedUnits
        stakedApps
        stakedGateways
        stakedSuppliers
      }
    }
    # 24h sums from the block statistics function. lib/data/home.ts reads its ESTIMATED (relay-mining
    # difficulty-scaled) totals so the 24h cards match the ecosystem-standard throughput shown by
    # PoktScan; on-chain "claimed" totals are ~2.5x lower.
    window: getBlockStatsJson(rangeStart: $last24HourDate, rangeEnd: $currentDate)
  }
`;
