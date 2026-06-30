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

// Supplier traffic → routing gateway. The signing gateway is NOT recorded on any claim/relay/proof
// (verified), so routing is reconstructed: settled claims carry (serviceId, applicationId, numRelays,
// block); each served app exposes its delegated gateways. grouped-by [SERVICE_ID, APPLICATION_ID]
// gives the EXACT per-pair totals (no sampling); `servedApps` resolves each app → its gateways.
export const SUPPLIER_ROUTING = /* GraphQL */ `
  query supplierRouting($id: String!) {
    supplier(id: $id) {
      settled: eventClaimSettleds {
        groupedAggregates(groupBy: [SERVICE_ID, APPLICATION_ID]) {
          keys
          sum {
            numRelays
          }
          max {
            blockId
          }
        }
      }
      servedApps: applicationsByEventClaimSettledSupplierIdAndApplicationId {
        nodes {
          id
          applicationGateways {
            nodes {
              gatewayId
            }
          }
        }
      }
    }
  }
`;
