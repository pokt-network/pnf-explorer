// Supplier list query (post-MVP scope expansion). Suppliers list shows ACTIVE (Staked) only —
// there are 10,808 supplier records but ~4,082 currently staked; the rest are long-unstaked noise.
// id is the operator pokt1 address (links to /account). The # of services served is SUPPLIER_SERVICE_COUNTS.

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
      }
    }
  }
`;

// The # of services each listed supplier has a live config for (up to 200 ids), from the fleet function: the closed
// schema has no nested `serviceConfigs { totalCount }`.
export const SUPPLIER_SERVICE_COUNTS = /* GraphQL */ `
  query supplierServiceCounts($ids: [String]) {
    getSupplierFleetList(suppliers: $ids) {
      supplierId
      serviceCount
    }
  }
`;

// Supplier traffic → routing gateway. The signing gateway is NOT recorded on any claim/relay/proof
// (verified), so routing is reconstructed: settled claims carry (serviceId, applicationId, relays,
// block); each served app exposes its delegated gateways. The settlement catalog per (service,
// application) gives the EXACT per-pair totals (no sampling) and each pair's last settled height;
// SERVED_APP_GATEWAYS resolves each app → its gateways.
export const SUPPLIER_ROUTING = /* GraphQL */ `
  query supplierRouting($suppliers: [String]) {
    getSupplierEarningsJson(suppliers: $suppliers, rangeStart: null, rangeEnd: null, bySupplier: false, byService: true, byApplication: true)
  }
`;

// The gateways the listed applications delegate to now, paged by the connection cap.
export const SERVED_APP_GATEWAYS = /* GraphQL */ `
  query servedAppGateways($ids: [String!], $limit: Int!, $offset: Int!) {
    applicationGateways(filter: { applicationId: { in: $ids } }, orderBy: ID_ASC, first: $limit, offset: $offset) {
      totalCount
      nodes {
        applicationId
        gatewayId
      }
    }
  }
`;
