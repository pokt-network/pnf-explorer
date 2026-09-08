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

// ---- delegator APR (validator detail) ----
// Shannon validators earn a share of RELAY SETTLEMENT at each session end, not per-block proposer
// rewards, and it is paid straight to delegator wallets — there is no claim step. The record is
// `eventValidatorRewardDistributions`, one row per validator per session (every 20 blocks).
//
// `delegatorsRewardAmount` is ALREADY NET of commission — verified against a 9%-commission
// validator, where it is exactly 91.00% of `poolShareAmount` on every sampled row, and the identity
// pool = commission + delegators + selfDelegation holds on 100/100 rows. Subtracting commission
// again is the obvious mistake here and would understate the delegator's return by the commission
// rate.
//
// `first`/`last` bracket the validator's ACTIVE span inside the window. A validator that started
// (or stopped) mid-window earned over less time than the window is long, and dividing by the full
// 30 days would understate its rate — one live validator has only 1,682 of 2,047 settlements.
export const VALIDATOR_DELEGATOR_APR = /* GraphQL */ `
  query validatorDelegatorApr($id: String!, $startBlock: BigFloat!) {
    window: eventValidatorRewardDistributions(
      filter: { validatorOperatorAddress: { equalTo: $id }, blockId: { greaterThanOrEqualTo: $startBlock } }
    ) {
      totalCount
      aggregates {
        sum {
          delegatorsRewardAmount
          commissionAmount
        }
        average {
          totalDelegatedStakeAmount
        }
        min {
          totalDelegatedStakeAmount
        }
        max {
          totalDelegatedStakeAmount
        }
      }
    }
    first: eventValidatorRewardDistributions(
      first: 1
      orderBy: BLOCK_ID_ASC
      filter: { validatorOperatorAddress: { equalTo: $id }, blockId: { greaterThanOrEqualTo: $startBlock } }
    ) {
      nodes {
        blockId
        block {
          timestamp
        }
      }
    }
    last: eventValidatorRewardDistributions(
      first: 1
      orderBy: BLOCK_ID_DESC
      filter: { validatorOperatorAddress: { equalTo: $id }, blockId: { greaterThanOrEqualTo: $startBlock } }
    ) {
      nodes {
        blockId
        block {
          timestamp
        }
      }
    }
  }
`;

// ---- delegator APR for the whole set (validators list) ----
// Same events and same arithmetic as VALIDATOR_DELEGATOR_APR, rolled up in one round trip so the
// list does not fan out one query per validator. `min`/`max` on `blockId` bracket each validator's
// active span the way `first`/`last` do for a single validator; the caller resolves those heights
// to real block timestamps (a nominal block time would quietly skew every annualised rate).
//
// Validators with no settlement in the window are simply absent from the groups — the list shows a
// dash for them rather than a zero, which would read as "earns nothing" instead of "no data".
export const VALIDATORS_DELEGATOR_APR = /* GraphQL */ `
  query validatorsDelegatorApr($startBlock: BigFloat!) {
    window: eventValidatorRewardDistributions(filter: { blockId: { greaterThanOrEqualTo: $startBlock } }) {
      groupedAggregates(groupBy: VALIDATOR_OPERATOR_ADDRESS) {
        keys
        distinctCount {
          id
        }
        sum {
          delegatorsRewardAmount
        }
        average {
          totalDelegatedStakeAmount
        }
        min {
          blockId
          totalDelegatedStakeAmount
        }
        max {
          blockId
          totalDelegatedStakeAmount
        }
      }
    }
  }
`;
