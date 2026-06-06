// Global-search queries — verbatim from assets/api-index/_shared.md.

export const SEARCH_BY_ADDRESS = /* GraphQL */ `
  query searchByAddress($address: String!) {
    account(id: $address) {
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
    supplier(id: $address) {
      id
      stakeStatus
      stakeAmount
      stakeDenom
    }
    application(id: $address) {
      id
      stakeStatus
      stakeAmount
      stakeDenom
    }
    gateway(id: $address) {
      id
      stakeStatus
      stakeAmount
      stakeDenom
    }
  }
`;

export const SEARCH_VALIDATOR_BY_ADDRESS = /* GraphQL */ `
  query searchValidatorByAddress($address: String!) {
    validator(id: $address) {
      id
      stakeAmount
      stakeDenom
      stakeStatus
    }
  }
`;

export const SEARCH_BY_HASH = /* GraphQL */ `
  query searchByHash($hash: String!) {
    blocks(filter: { hash: { equalTo: $hash } }, first: 1) {
      nodes {
        hash
        height: id
        timestamp
        totalTxs
      }
    }
    transaction(id: $hash) {
      id
      code
      amountOfMessages
    }
  }
`;

export const SEARCH_BY_HEIGHT = /* GraphQL */ `
  query searchByHeight($height: BigFloat!) {
    block(id: $height) {
      height: id
      hash
      timestamp
      totalTxs
    }
  }
`;

export const SEARCH_SERVICES = /* GraphQL */ `
  query searchServices($text: String!) {
    services(filter: { or: [{ id: { includesInsensitive: $text } }, { name: { includesInsensitive: $text } }] }) {
      nodes {
        id
        name
      }
    }
  }
`;
