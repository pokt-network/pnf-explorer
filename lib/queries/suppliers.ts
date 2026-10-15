// Supplier list query (post-MVP scope expansion). Suppliers list shows ACTIVE (Staked) only —
// there are 10,808 supplier records but ~4,082 currently staked; the rest are long-unstaked noise.
// id is the operator pokt1 address (links to /account). One request: the fleet function lists the page (largest stake
// first, then by id) with each supplier's # of services, and the plain list gives the total. Keyset mode: it computes
// `rowLimit` rows after the cursor (lib/data/suppliers.ts fleetPage), not every Staked supplier.

export const SUPPLIERS_LIST = /* GraphQL */ `
  query suppliersList($rowLimit: Int, $afterStakeUpokt: BigFloat, $afterSupplierId: String, $limit: Int!, $offset: Int!) {
    getSupplierFleetList(
      stakeStatuses: ["Staked"]
      rowLimit: $rowLimit
      afterStakeUpokt: $afterStakeUpokt
      afterSupplierId: $afterSupplierId
      first: $limit
      offset: $offset
    ) {
      supplierId
      ownerId
      stakeUpokt
      stakeStatus
      serviceCount
    }
    suppliers(filter: { stakeStatus: { equalTo: Staked } }) {
      totalCount
    }
  }
`;

// Supplier traffic → routing gateway. The signing gateway is NOT recorded on any claim/relay/proof
// (verified), so routing is reconstructed: settled claims carry (serviceId, applicationId, relays,
// block); each served app exposes its delegated gateways. The settlement catalog per (service,
// application) gives the EXACT per-pair totals (no sampling), each pair's last settled height and the
// application's gateways now (gateway_ids), in one read.
export const SUPPLIER_ROUTING = /* GraphQL */ `
  query supplierRouting($suppliers: [String]) {
    getSupplierEarningsJson(suppliers: $suppliers, rangeStart: null, rangeEnd: null, bySupplier: false, byService: true, byApplication: true)
  }
`;
