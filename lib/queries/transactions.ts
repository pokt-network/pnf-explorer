// Transaction queries — from assets/api-index/{_shared,list-txs}.md, reading each row's `blockId` instead of the nested
// block (the indexer's closed schema has no relations; each row's computed `blockTime` is its block's time, null while the block row is not committed).
// `transactionsByHeight`/`transactionsByAddress` are the same shape, filtered via $filter:
//   at-height  → { blockId: { equalTo: <height> } }
//   by-address → { signerAddress: { equalTo: <addr> } }
//   by-type    → { amountOfMessages: { contains: [{ type: <type url> }] } }  (lib/data/transactions.ts)

const TX_NODES = /* GraphQL */ `
  nodes {
    id
    code
    blockId
    blockTime
    gasUsed
    gasWanted
    signerAddress
    fees
    amountOfMessages
    amountSentByDenom
  }
`;

const TX_FIELDS = /* GraphQL */ `
  totalCount
  ${TX_NODES}
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
  query transactionsList($limit: Int!, $offset: Int!, $filter: TransactionFilter, $withCount: Boolean = true) {
    transactions(first: $limit, offset: $offset, orderBy: BLOCK_ID_DESC, filter: $filter) {
      # A count over every transaction: skipped where the total is not shown.
      totalCount @include(if: $withCount)
      ${TX_NODES}
    }
  }
`;

export const TRANSACTION_DETAIL = /* GraphQL */ `
  query transaction($id: String!) {
    transaction(id: $id) {
      id
      code
      codespace
      blockId
      blockTime
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
        blockId
        blockTime
        transactionId
      }
    }
  }
`;

// Counts come from the per-block counters (blocks.total_txs / successful_txs / failed_txs), which
// sum to exactly the transaction counts (verified 2026-10-05 on both networks at a pinned height)
// without counting the 42M-row transactions table; the block statistics function sums them. `chain`
// is the all-time total (null range = the whole chain), only needed by the all/success/failed chips.
export const TRANSACTIONS_SUMMARY = /* GraphQL */ `
  query transactionsSummary($startDate: Datetime!, $endDate: Datetime!, $withChain: Boolean!) {
    blocks(orderBy: ID_DESC, first: 1) {
      nodes {
        totalTxs
      }
    }
    day: getBlockStatsJson(rangeStart: $startDate, rangeEnd: $endDate)
    chain: getBlockStatsJson(rangeStart: null, rangeEnd: null) @include(if: $withChain)
  }
`;
