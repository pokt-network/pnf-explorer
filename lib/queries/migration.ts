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

// A Morse-address search: the account with that id, and (paged, counted) the accounts whose output (custodial) address
// it is, in the list's order and without that id. Two aliases instead of one OR, so each filter can use its own index
// (id has one; morse_output_address gets one from pocketdex). Each alias is its own statement, not one snapshot.
export const MORSE_CLAIMABLE_BY_MORSE_ADDRESS = /* GraphQL */ `
  query morseClaimableByMorseAddress($id: String!, $output: String!, $limit: Int!, $offset: Int!) {
    byId: morseClaimableAccounts(first: 1, filter: { id: { equalTo: $id } }) {
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
    byOutput: morseClaimableAccounts(
      first: $limit
      offset: $offset
      filter: { morseOutputAddress: { equalTo: $output }, id: { notEqualTo: $id } }
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
