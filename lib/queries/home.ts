// Home summary — the non-chart subset of the verified `summary` query (home.md §6): economic
// total supply + latest-block staked-actor counts + 24h relay/CU aggregates.
//
// Total supply is the indexer's `getTotalSupplyByDay.total_supply` = minted Shannon supply PLUS
// claimable-but-unminted balances (valid Morse claims that can be minted on Shannon at any time).
// This is the figure exchanges/traders expect (matches PoktScan/pokt.money). `lastBlock.supplies`
// is kept only as a fallback (the already-minted `shannon_supply` slice).
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
        supplies {
          nodes {
            supply {
              denom
              amount
            }
          }
        }
      }
    }
    window: blocks(filter: { timestamp: { greaterThanOrEqualTo: $last24HourDate, lessThanOrEqualTo: $currentDate } }) {
      aggregates {
        sum {
          # Aliased to the ESTIMATED (relay-mining difficulty-scaled) totals so the 24h cards match
          # the ecosystem-standard throughput shown by PoktScan; on-chain "claimed" totals are ~2.5x lower.
          totalRelays: totalEstimatedRelays
          totalComputedUnits: totalEstimatedComputedUnits
        }
      }
    }
  }
`;
