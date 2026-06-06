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
