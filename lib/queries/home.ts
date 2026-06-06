// Home summary — the non-chart subset of the verified `summary` query (home.md §6): latest
// block (for supply via supplies + staked actor counts) + 24h relay/CU aggregates. The
// getTotalSupplyByDay chart series is intentionally skipped; supply comes from lastBlock.supplies.
export const HOME_SUMMARY = /* GraphQL */ `
  query homeSummary($last24HourDate: Datetime!, $currentDate: Datetime!) {
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
