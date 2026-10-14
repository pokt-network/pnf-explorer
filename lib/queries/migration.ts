// Morse → Shannon migration queries. The accounts come from the morseClaimableAccounts list (own columns only:
// claimedAtId is the claim height, transactionId the claim tx hash); the totals from the getMorseClaimSummary catalog
// function, one row per side (claimed true/false) — a network with no imported Morse state returns no rows.

// Claimed first, newest claim first. Bulk claims share a height, so ID_ASC keeps the pages stable.
export const MORSE_CLAIMABLE_ACCOUNTS = /* GraphQL */ `
  query morseClaimableAccounts($limit: Int!, $offset: Int!, $filter: MorseClaimableAccountFilter) {
    morseClaimableAccounts(
      first: $limit
      offset: $offset
      filter: $filter
      orderBy: [CLAIMED_DESC, CLAIMED_AT_ID_DESC, ID_ASC]
    ) {
      totalCount
      nodes {
        id
        shannonDestAddress
        claimed
        claimedAtId
        transactionId
        unstakedBalanceAmount
        supplierStakeAmount
        applicationStakeAmount
      }
    }
  }
`;

export const MORSE_CLAIM_SUMMARY = /* GraphQL */ `
  query morseClaimSummary {
    getMorseClaimSummaryList {
      claimed
      accounts
      unstakedBalanceUpokt
      supplierStakeUpokt
      applicationStakeUpokt
    }
  }
`;

// Supplier claims whose supplier address or owner is one of $shannon, newest first, 1000 per call; the next page passes
// the last row's height and id as $beforeHeight / $beforeId (keyset). Only the Morse address is read: the list above
// then matches it, since morseClaimableAccounts' destination is not reliable for supplier claims yet.
export const MORSE_SUPPLIER_CLAIMS = /* GraphQL */ `
  query morseSupplierClaims($shannon: [String], $beforeHeight: BigInt, $beforeId: String) {
    getMorseClaimsList(shannonAddresses: $shannon, kinds: ["supplier"], rowLimit: 1000, beforeHeight: $beforeHeight, beforeId: $beforeId) {
      height
      id
      morseSrcAddress
    }
  }
`;
