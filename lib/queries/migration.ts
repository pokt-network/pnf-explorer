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
