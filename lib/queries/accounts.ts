// Account queries — verbatim from assets/api-index/{list-accounts,detail-account}.md.

export const ACCOUNT_LIST = /* GraphQL */ `
  query accountList($limit: Int!, $offset: Int!) {
    balances(first: $limit, offset: $offset, orderBy: AMOUNT_DESC, filter: { denom: { equalTo: "upokt" } }) {
      totalCount
      nodes {
        amount
        denom
        accountId
        lastUpdatedBlock {
          height: id
          timestamp
        }
      }
    }
  }
`;

export const ACCOUNT_SUMMARY = /* GraphQL */ `
  query accountSummary($todayDate: Datetime!, $monthDate: Datetime!, $last90Date: Datetime!) {
    accountsWithBalance: balances(filter: { amount: { greaterThan: "0" } }) {
      totalCount
    }
    todayAccounts: balances(filter: { lastUpdatedBlock: { timestamp: { greaterThanOrEqualTo: $todayDate } }, denom: { equalTo: "upokt" } }) {
      totalCount
    }
    monthAccounts: balances(filter: { lastUpdatedBlock: { timestamp: { greaterThanOrEqualTo: $monthDate } }, denom: { equalTo: "upokt" } }) {
      totalCount
    }
    last90DaysAccounts: balances(filter: { lastUpdatedBlock: { timestamp: { greaterThanOrEqualTo: $last90Date } }, denom: { equalTo: "upokt" } }) {
      totalCount
    }
  }
`;

export const ACCOUNT_BY_ID = /* GraphQL */ `
  query accountById($id: String!) {
    account(id: $id) {
      id
      balances {
        nodes {
          amount
          denom
          lastUpdatedBlock {
            height: id
            timestamp
          }
        }
      }
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
//   • serviceConfigs.nodes carry per-service `revShare` + `endpoints` (JSON scalars).
//   • unstaking* fields populate only while stakeStatus == Unstaking; `unstakingEndHeight` is the
//     exact unbond block (→ ETA against current height).
export const ACCOUNT_ROLES = /* GraphQL */ `
  query accountRoles($id: String!, $rsMatch: JSON) {
    account(id: $id) {
      id
      balances {
        nodes {
          amount
          denom
          lastUpdatedBlock {
            height: id
            timestamp
          }
        }
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
      serviceConfigs {
        totalCount
        nodes {
          serviceId
          revShare
          endpoints
        }
      }
    }
    ownedOperators: suppliers(filter: { ownerId: { equalTo: $id } }) {
      totalCount
      aggregates {
        sum {
          stakeAmount
        }
      }
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
      applicationServices {
        totalCount
      }
      applicationGateways {
        totalCount
      }
    }
    asGateway: gateway(id: $id) {
      id
      stakeAmount
      stakeStatus
      unstakingEndHeight
      applicationGateways {
        totalCount
      }
    }
    ownedServices: services(filter: { ownerId: { equalTo: $id } }) {
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
// wild). Active-or-not: NOT filtered to Staked — an owner wants to see unstaking nodes too.
export const OWNED_OPERATORS = /* GraphQL */ `
  query ownedOperators($id: String!, $limit: Int!, $offset: Int!) {
    suppliers(filter: { ownerId: { equalTo: $id } }, first: $limit, offset: $offset, orderBy: STAKE_AMOUNT_DESC) {
      totalCount
      nodes {
        id
        stakeStatus
        stakeAmount
        serviceConfigs {
          totalCount
        }
      }
    }
  }
`;
