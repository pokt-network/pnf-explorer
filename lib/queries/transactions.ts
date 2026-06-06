// Transaction queries — verbatim from assets/api-index/{_shared,list-txs}.md.
// `transactionsByHeight`/`transactionsByAddress` are the same shape, filtered via $filter:
//   at-height  → { blockId: { equalTo: <height> } }
//   by-address → { signerAddress: { equalTo: <addr> } }  (and/or relation filters)
//   by-type    → { <msg>Exist: true } e.g. msgCreateClaimsExist  (DATA-CONTRACT §4)

const TX_FIELDS = /* GraphQL */ `
  totalCount
  nodes {
    id
    code
    block {
      timestamp
      height: id
    }
    gasUsed
    gasWanted
    signerAddress
    fees
    amountOfMessages
    amountSentByDenom
  }
`;

export const TRANSACTIONS_BY_HEIGHT = /* GraphQL */ `
  query transactionsByHeight($limit: Int!, $offset: Int!, $filter: TransactionFilter) {
    transactions(first: $limit, offset: $offset, filter: $filter, orderBy: BLOCK_ID_DESC) {
      ${TX_FIELDS}
    }
  }
`;

export const TRANSACTIONS_BY_ADDRESS = /* GraphQL */ `
  query transactionsByAddress($limit: Int!, $offset: Int!, $filter: TransactionFilter) {
    transactions(first: $limit, offset: $offset, filter: $filter, orderBy: BLOCK_ID_DESC) {
      ${TX_FIELDS}
    }
  }
`;

export const TRANSACTIONS_LIST = /* GraphQL */ `
  query transactionsList($limit: Int!, $offset: Int!, $filter: TransactionFilter) {
    transactions(first: $limit, offset: $offset, orderBy: BLOCK_ID_DESC, filter: $filter) {
      ${TX_FIELDS}
    }
  }
`;

export const TRANSACTION_DETAIL = /* GraphQL */ `
  query transaction($id: String!) {
    transaction(id: $id) {
      id
      code
      codespace
      block {
        timestamp
        height: id
      }
      gasUsed
      gasWanted
      signerAddress
      fees
      memo
      isMultisig
      multisig
      amountSentByDenom
    }
  }
`;

export const TRANSFERS_LIST = /* GraphQL */ `
  query transfersList($limit: Int!, $offset: Int!, $address: String!) {
    transfers: nativeTransfers(
      first: $limit
      offset: $offset
      orderBy: BLOCK_ID_DESC
      filter: { or: [{ senderId: { equalTo: $address } }, { recipientId: { equalTo: $address } }] }
    ) {
      totalCount
      nodes {
        id
        senderId
        recipientId
        amounts
        denom
        block {
          height: id
          timestamp
        }
        transaction {
          id
          fees
          gasUsed
          gasWanted
          code
          codespace
        }
      }
    }
  }
`;

export const TRANSACTIONS_SUMMARY = /* GraphQL */ `
  query transactionsSummary($startDate: Datetime!, $endDate: Datetime!) {
    blocks(orderBy: ID_DESC, first: 1) {
      nodes {
        totalTxs
      }
    }
    validTxs: transactions(
      filter: { code: { equalTo: 0 }, block: { timestamp: { greaterThanOrEqualTo: $startDate, lessThanOrEqualTo: $endDate } } }
    ) {
      totalCount
    }
    failedTxs: transactions(
      filter: { code: { notEqualTo: 0 }, block: { timestamp: { greaterThanOrEqualTo: $startDate, lessThanOrEqualTo: $endDate } } }
    ) {
      totalCount
    }
  }
`;
