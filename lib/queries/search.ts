// Global-search queries.

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
