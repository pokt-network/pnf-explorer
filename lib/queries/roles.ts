// Role-view queries (ROLE-VIEWS-DESIGN.md §3). Each actor an address can be — supplier operator,
// supplier owner, application, gateway, service owner, rev-share recipient — is an independent
// state machine with its own read set. These queries are fetched ONLY for the active role, so a
// 98-operator owner wallet never pays for supplier service-config work.
//
// Verified live against data.pocket.network (poktroll v0.1.34) on 2026-08-19.

// ---- supplier (operator) ----
// One round-trip for the whole supplier role: current config (services/endpoints/rev-share) AND
// the lifetime settlement rollup, grouped per service so the Services tab can show "configured for
// X, earned Y on it" in a single table (the report's "3 pages to build a mental map" complaint).
//
// NOTE `settled.groupedAggregates` covers every service the supplier has EVER settled a claim on,
// which is a superset of the currently-configured ones (pokt1w8mta…: 3 configured, 32 settled).
// The UI joins on serviceId and renders the leftovers as "no longer configured".
export const SUPPLIER_ROLE = /* GraphQL */ `
  query supplierRole($id: String!) {
    supplier(id: $id) {
      id
      operatorId
      ownerId
      stakeAmount
      stakeDenom
      stakeStatus
      unstakingReason
      unstakingBeginBlockId
      unstakingEndHeight
      serviceConfigs {
        totalCount
        nodes {
          serviceId
          revShare
          endpoints
        }
      }
      settled: eventClaimSettleds {
        totalCount
        aggregates {
          sum {
            numRelays
            claimedAmount
            settledAmount
            mintedAmount
          }
        }
        groupedAggregates(groupBy: [SERVICE_ID]) {
          keys
          sum {
            numRelays
            claimedAmount
            settledAmount
          }
          max {
            blockId
          }
        }
      }
      slashes: eventSupplierSlasheds {
        totalCount
        aggregates {
          sum {
            proofMissingPenalty
          }
        }
      }
      stakeMsgs {
        totalCount
      }
      unstakeMsgs {
        totalCount
      }
    }
  }
`;

// Payout ledger: every mod→account settlement transfer emitted by this supplier's settled claims,
// grouped by recipient. This is the ACTUAL earnings split, as opposed to the configured rev-share
// percentages — the two diverge whenever the config has changed (see design doc §4).
//
// The nested-relation filter IS respected by groupedAggregates: group distinctCounts sum exactly to
// totalCount (verified 497,142 across 606 groups). NEVER query modToAcctTransfers without a parent
// filter — the unconstrained table times out server-side.
export const SUPPLIER_PAYOUTS = /* GraphQL */ `
  query supplierPayouts($id: String!) {
    modToAcctTransfers(filter: { eventClaimSettled: { supplierId: { equalTo: $id } } }) {
      totalCount
      aggregates {
        sum {
          amount
        }
      }
      groupedAggregates(groupBy: [RECIPIENT_ID]) {
        keys
        sum {
          amount
        }
        distinctCount {
          id
        }
      }
    }
  }
`;

// Supplier lifecycle: stake/unstake messages and slash events, newest first. Powers the History tab.
export const SUPPLIER_HISTORY = /* GraphQL */ `
  query supplierHistory($id: String!, $limit: Int!) {
    supplier(id: $id) {
      stakeMsgs(first: $limit, orderBy: BLOCK_ID_DESC) {
        totalCount
        nodes {
          id
          stakeAmount
          stakeDenom
          blockId
          transactionId
        }
      }
      unstakeMsgs(first: $limit, orderBy: BLOCK_ID_DESC) {
        totalCount
        nodes {
          id
          blockId
          transactionId
        }
      }
      slashes: eventSupplierSlasheds(first: $limit, orderBy: BLOCK_ID_DESC) {
        totalCount
        nodes {
          id
          serviceId
          blockId
          proofMissingPenalty
          previousStakeAmount
          afterStakeAmount
          proofValidationStatus
        }
      }
    }
  }
`;

// ---- supplier owner (fleet) ----
// Fleet ids first (capped at the connection limit), then the settlement rollup over that id set.
// Rollups MUST go through supplierId — `supplierOwnerId` on claim events is a newer field present
// on only ~25% of rows (1,315 of 5,296 for pokt1w8mta…), which silently under-reports by 20×.
export const OWNER_FLEET_IDS = /* GraphQL */ `
  query ownerFleetIds($id: String!, $limit: Int!) {
    suppliers(filter: { ownerId: { equalTo: $id } }, first: $limit, orderBy: STAKE_AMOUNT_DESC) {
      totalCount
      nodes {
        id
      }
    }
  }
`;

export const FLEET_EARNINGS = /* GraphQL */ `
  query fleetEarnings($ids: [String!]) {
    eventClaimSettleds(filter: { supplierId: { in: $ids } }) {
      totalCount
      aggregates {
        sum {
          numRelays
          claimedAmount
          settledAmount
        }
      }
      bySupplier: groupedAggregates(groupBy: [SUPPLIER_ID]) {
        keys
        sum {
          numRelays
          claimedAmount
          settledAmount
        }
        max {
          blockId
        }
      }
      byService: groupedAggregates(groupBy: [SERVICE_ID]) {
        keys
        sum {
          numRelays
          claimedAmount
          settledAmount
        }
      }
    }
  }
`;

// ---- application ----
// Claim amounts on an application are SPEND (stake burned to pay suppliers), not income.
export const APPLICATION_ROLE = /* GraphQL */ `
  query applicationRole($id: String!) {
    application(id: $id) {
      id
      stakeAmount
      stakeDenom
      stakeStatus
      unstakingReason
      unstakingBeginBlockId
      unstakingEndHeight
      transferringToId
      transferEndHeight
      sourceApplicationId
      destinationApplicationId
      applicationServices {
        totalCount
        nodes {
          serviceId
        }
      }
      applicationGateways {
        totalCount
      }
      settled: eventClaimSettleds {
        totalCount
        aggregates {
          sum {
            numRelays
            claimedAmount
            settledAmount
          }
        }
        groupedAggregates(groupBy: [SERVICE_ID]) {
          keys
          sum {
            numRelays
            claimedAmount
            settledAmount
          }
          max {
            blockId
          }
        }
      }
      overserviced: eventApplicationOverserviceds {
        totalCount
      }
    }
  }
`;

// ---- gateway ----
// A gateway signs relays but is NOT recorded on any claim/relay/proof, so its traffic is derived:
// the apps that delegate to it → their settled claims. Same authorized-routing inference the
// supplier Traffic tab uses, in the opposite direction. Delegating apps are capped at the
// connection limit; the UI labels the coverage when the fleet is truncated.
export const GATEWAY_ROLE = /* GraphQL */ `
  query gatewayRole($id: String!, $limit: Int!) {
    gateway(id: $id) {
      id
      stakeAmount
      stakeDenom
      stakeStatus
      unstakingBeginBlockId
      unstakingEndHeight
      applicationGateways(first: $limit) {
        totalCount
        nodes {
          applicationId
        }
      }
      delegations: msgDelegateToGateways {
        totalCount
      }
      undelegations: msgUndelegateFromGateways {
        totalCount
      }
    }
  }
`;

export const GATEWAY_TRAFFIC = /* GraphQL */ `
  query gatewayTraffic($ids: [String!]) {
    eventClaimSettleds(filter: { applicationId: { in: $ids } }) {
      totalCount
      aggregates {
        sum {
          numRelays
          claimedAmount
        }
      }
      byService: groupedAggregates(groupBy: [SERVICE_ID]) {
        keys
        sum {
          numRelays
          claimedAmount
        }
        max {
          blockId
        }
      }
    }
  }
`;

// ---- service owner ----
// Paginated: the PNF service-owner wallet owns 138 services, well past a sane inline list.
export const SERVICE_OWNER_ROLE = /* GraphQL */ `
  query serviceOwnerRole($id: String!, $limit: Int!, $offset: Int!) {
    services(filter: { ownerId: { equalTo: $id } }, orderBy: ID_ASC, first: $limit, offset: $offset) {
      totalCount
      nodes {
        id
        name
        computeUnitsPerRelay
        supplierServiceConfigs {
          totalCount
        }
        applicationServices {
          totalCount
        }
      }
    }
  }
`;

// ---- rev-share income (reverse lookup) ----
// "Which suppliers pay THIS address, and what has it actually received." The amount half is
// constrained to the paying suppliers on the current page — a recipientId-only aggregate over the
// whole transfer table times out. modToAcctTransfers carries no supplierId column, so a per-supplier
// split isn't groupable here; the per-recipient breakdown lives on each supplier's Earnings tab.
export const REVSHARE_INCOME_AMOUNTS = /* GraphQL */ `
  query revShareIncomeAmounts($recipient: String!, $supplierIds: [String!]) {
    modToAcctTransfers(
      filter: { recipientId: { equalTo: $recipient }, eventClaimSettled: { supplierId: { in: $supplierIds } } }
    ) {
      totalCount
      aggregates {
        sum {
          amount
        }
      }
      byReason: groupedAggregates(groupBy: [OP_REASON]) {
        keys
        sum {
          amount
        }
      }
    }
  }
`;
