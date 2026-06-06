// Params query — verbatim from assets/api-index/params.md. distinct [NAMESPACE, KEY] so each
// param is its latest value; grouped by namespace in the UI.
export const PARAMS = /* GraphQL */ `
  query params {
    params(orderBy: [BLOCK_ID_DESC], distinct: [NAMESPACE, KEY], first: 1000) {
      nodes {
        namespace
        id
        key
        value
        block {
          height: id
        }
      }
    }
  }
`;
