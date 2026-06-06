// Validator queries — verbatim from assets/api-index/{list-validators,detail-validator}.md.
// NOTE: stakeStatus is the StakeStatus enum (Staked/Unstaking/Unstaked), NOT Bonded/Unbonding.
// commission + description are JSON OBJECTS — parse via lib/validator.ts.

export const VALIDATORS_LIST = /* GraphQL */ `
  query validatorsList($limit: Int!, $offset: Int!) {
    validators(first: $limit, offset: $offset) {
      totalCount
      nodes {
        id
        signerId
        description
        commission
        minSelfDelegation
        stakeDenom
        stakeAmount
        stakeStatus
        signer {
          id
        }
      }
    }
  }
`;

// Note: signerId is the VALOPER (poktvaloper…) and signer.balances is empty. The pokt1 operator
// account is signerPoktPrefixId / signerPoktPrefix (verified live) — use THAT for the signer link,
// signer balance, and the address tx/transfer tab filters.
export const VALIDATOR_BY_ID = /* GraphQL */ `
  query validatorById($id: String!) {
    validator(id: $id) {
      id
      signerId
      signerPoktPrefixId
      description
      commission
      minSelfDelegation
      stakeDenom
      stakeAmount
      stakeStatus
      signerPoktPrefix {
        id
        balances {
          nodes {
            amount
            denom
          }
        }
      }
    }
  }
`;

export const VALIDATOR_UPTIME = /* GraphQL */ `
  query validatorUptime($from: BigInt!, $validatorHexAddress: String!) {
    producedBlocks: getProducedBlocksByValidator(fromId: $from, validatorAddress: $validatorHexAddress)
    missedBlocks: getMissingValidatorBlocks(fromId: $from, validatorAddress: $validatorHexAddress)
  }
`;
