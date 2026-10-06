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

// ---- delegator APR (validator detail and list) ----
// Shannon validators earn a share of RELAY SETTLEMENT at each session end, not per-block proposer
// rewards, and it is paid straight to delegator wallets — there is no claim step. The money
// catalog's get_validator_rewards sums it per validator and UTC day over a time window: one row per
// validator and day with `delegators_upokt`, `commission_upokt`, `distributions` (settlements) and
// the delegated stake each settlement saw (`delegated_stake_{avg,min,max}_upokt`). `validators: null`
// returns every validator, so the list does not fan out one query per validator. For a range the
// catalog does not cover it raises, or answers what it covers; see trailingRange in lib/data/window.ts.
//
// `delegators_upokt` is ALREADY NET of commission — verified against a 9%-commission validator,
// where it is exactly 91.00% of the pool on every sampled row, and the identity
// pool = commission + delegators + selfDelegation holds on 100/100 rows. Subtracting commission
// again is the obvious mistake here and would understate the delegator's return by the commission
// rate.
//
// The first and last hours with settlements bracket the validator's ACTIVE span inside the window
// (day rows for the window, then hour rows for its first and last day). A validator that started
// (or stopped) mid-window earned over less time than the window is long, and dividing by the full
// 30 days would understate its rate.
export const VALIDATOR_REWARDS = /* GraphQL */ `
  query validatorRewards($validators: [String], $rangeStart: Datetime!, $rangeEnd: Datetime!, $bucket: String!) {
    getValidatorRewardsJson(validators: $validators, rangeStart: $rangeStart, rangeEnd: $rangeEnd, bucket: $bucket)
  }
`;
