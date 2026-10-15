// Account queries — from assets/api-index/{list-accounts,detail-account}.md, on the indexer's closed schema: each row's
// own `lastUpdatedBlockId` instead of the nested block, flat roots instead of relations, and the fleet function for sums.

export const ACCOUNT_LIST = /* GraphQL */ `
  query accountList($limit: Int!, $offset: Int!) {
    balances(first: $limit, offset: $offset, orderBy: AMOUNT_DESC, filter: { denom: { equalTo: "upokt" } }) {
      totalCount
      nodes {
        amount
        denom
        accountId
        lastUpdatedBlockId
      }
    }
  }
`;

// Accounts with a balance, and those active since each date (getActiveAccountsList: the live upokt balances last
// updated in a block at or after it; `accounts` null when `beyondTip`, the date being past the indexed tip).
export const ACCOUNT_SUMMARY = /* GraphQL */ `
  query accountSummary($sinceTimes: [Datetime]!) {
    accountsWithBalance: balances(filter: { amount: { greaterThan: "0" } }) {
      totalCount
    }
    active: getActiveAccountsList(sinceTimes: $sinceTimes) {
      sinceTime
      beyondTip
      accounts
    }
  }
`;

// Full role profile for an account detail page. A single `pokt1…` address can hold several roles
// at once (operator + owner + validator + app + gateway + service owner), so this resolves ALL of
// them in one round-trip. Notes:
//   • supplier(id) is the OPERATOR view; `ownerId` may differ from the address (owner≠operator is
//     the pro node-runner norm). The OWNER view is the reverse lookup `ownedOperators`.
//   • validator must be matched by `signerPoktPrefixId` (the pokt1 operator), NOT validator(id)
//     (that id is the poktvaloper…). first:1 — an operator backs one validator.
//   • the supplier's service configs carry per-service `revShare` + `endpoints` (JSON scalars).
//   • every relation of the old profile is its own flat root here (the closed schema has none), and
//     the owned operators' count and stake sum come from the fleet function.
//   • unstaking* fields populate only while stakeStatus == Unstaking; `unstakingEndHeight` is the
//     exact unbond block (→ ETA against current height).
export const ACCOUNT_ROLES = /* GraphQL */ `
  query accountRoles($id: String!, $ids: [String], $rsMatch: JSON) {
    account(id: $id) {
      id
    }
    balances(filter: { accountId: { equalTo: $id } }) {
      nodes {
        amount
        denom
        lastUpdatedBlockId
      }
    }
    supplier(id: $id) {
      id
      operatorId
      ownerId
      stakeAmount
      stakeStatus
      unstakingReason
      unstakingBeginBlockId
      unstakingEndHeight
    }
    serviceConfigs: supplierServiceConfigs(filter: { supplierId: { equalTo: $id } }) {
      totalCount
      nodes {
        serviceId
        revShare
        endpoints
      }
    }
    ownedOperators: getSupplierFleetList(owners: $ids, bySupplier: false) {
      supplierCount
      stakeUpokt
    }
    asValidator: validators(filter: { signerPoktPrefixId: { equalTo: $id } }, first: 1) {
      nodes {
        id
        signerId
        description
        commission
        minSelfDelegation
        stakeAmount
        stakeStatus
      }
    }
    asApp: application(id: $id) {
      id
      stakeAmount
      stakeStatus
      unstakingReason
      unstakingEndHeight
    }
    appServices: applicationServices(filter: { applicationId: { equalTo: $id } }) {
      totalCount
    }
    appGateways: applicationGateways(filter: { applicationId: { equalTo: $id } }) {
      totalCount
    }
    asGateway: gateway(id: $id) {
      id
      stakeAmount
      stakeStatus
      unstakingEndHeight
    }
    gatewayApps: applicationGateways(filter: { gatewayId: { equalTo: $id } }) {
      totalCount
    }
    # Only a preview of the ids is needed here (the rail/summary show a count); the full list is
    # paginated by the Service Owner role view.
    ownedServices: services(filter: { ownerId: { equalTo: $id } }, first: 6) {
      totalCount
      nodes {
        id
        name
        computeUnitsPerRelay
      }
    }
    # Rev-share recipient: supplier service-configs whose revShare[] pays this address. JSON
    # containment ($rsMatch = [{ address: $id }]); totalCount = # paying configs.
    revShareRecipient: supplierServiceConfigs(filter: { revShare: { contains: $rsMatch } }) {
      totalCount
    }
  }
`;

// Application → gateways it delegates to (paginated). Powers the "Delegated Gateways" tab.
export const APP_DELEGATED_GATEWAYS = /* GraphQL */ `
  query appDelegatedGateways($id: String!, $limit: Int!, $offset: Int!) {
    applicationGateways(filter: { applicationId: { equalTo: $id } }, first: $limit, offset: $offset) {
      totalCount
      nodes {
        gatewayId
      }
    }
  }
`;

// Gateway → applications delegating to it (paginated). Powers the "Delegating Apps" tab.
export const GATEWAY_DELEGATING_APPS = /* GraphQL */ `
  query gatewayDelegatingApps($id: String!, $limit: Int!, $offset: Int!) {
    applicationGateways(filter: { gatewayId: { equalTo: $id } }, first: $limit, offset: $offset) {
      totalCount
      nodes {
        applicationId
      }
    }
  }
`;

// Supplier service-configs that pay this address a rev-share cut (paginated). `revShare` is carried
// so the UI can surface THIS address's percentage on each row.
export const REVSHARE_RECIPIENT_CONFIGS = /* GraphQL */ `
  query revShareRecipientConfigs($rsMatch: JSON, $limit: Int!, $offset: Int!) {
    supplierServiceConfigs(filter: { revShare: { contains: $rsMatch } }, first: $limit, offset: $offset) {
      totalCount
      nodes {
        supplierId
        serviceId
        revShare
      }
    }
  }
`;

// Owner → operators, paginated. Powers the "Operators" tab for an owner wallet (98 operators in the
// wild). Active-or-not: NOT filtered to Staked — an owner wants to see unstaking nodes too. One
// request: the fleet function lists the page (largest stake first, then by id) with each operator's #
// of services, and the plain list gives the total. `rowLimit` limits the function to the rows up to the page within the
// first 1000 rows (lib/data/suppliers.ts fleetPage), so a big owner's first pages do not compute its whole fleet.
export const OWNED_OPERATORS = /* GraphQL */ `
  query ownedOperators($id: String!, $ids: [String], $rowLimit: Int, $limit: Int!, $offset: Int!) {
    getSupplierFleetList(
      owners: $ids
      rowLimit: $rowLimit
      first: $limit
      offset: $offset
    ) {
      supplierId
      stakeStatus
      stakeUpokt
      serviceCount
    }
    suppliers(filter: { ownerId: { equalTo: $id } }) {
      totalCount
    }
  }
`;
