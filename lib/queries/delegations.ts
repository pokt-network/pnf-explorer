// Staking-delegation queries (address page, `?as=delegation`).
//
// The delegations themselves are NOT indexed — there is no Delegation entity in the schema
// (`MsgDelegateToGateway` is the unrelated app→gateway delegation, and Cosmos staking messages are
// not indexed either). Delegations and the claimable balance are always-LCD, exactly like the
// validator Delegators tab (§2).
//
// WHERE A DELEGATOR'S INCOME ACTUALLY COMES FROM (verified live 2026-08-29 against
// pokt199ckyvz3d80u0qn58e8hxx9n5cxg5zudmhsjv8, 1,000,000 POKT bonded to two validators):
//
// Shannon pays the validator pool's share of relay settlement DIRECTLY to delegator wallets at each
// session end. `eventValidatorRewardDistributions` is the record: one row per validator per session
// carrying `delegatorsRewardAmount` (the whole pool's cut) and `totalDelegatedStakeAmount` (the
// stake it is divided over). A delegator's income is its pro-rata slice:
//
//     myShare = delegatorsRewardAmount × (myBondedStake / totalDelegatedStakeAmount)
//
// Cross-checked against the wallet: 327.03 POKT derived over a 17.2h window vs 321.32 POKT of
// observed balance growth — the ~1.8% gap is the window boundaries being eyeballed, not the model.
//
// DO NOT USE `modToAcctTransfers` WITH opReason TLM_RELAY_BURN_EQUALS_MINT_DELEGATOR_RD FOR THIS.
// It looks authoritative — exact amounts, real recipient, anchored to blocks — and it is neither the
// right money nor live. Over one 12,853-block window it carried 69.54 POKT against 3,536.76 POKT of
// actual delegator income (~2%), and the entire stream stops network-wide at block 892853 while
// balances keep growing. The separately-claimable LCD balance is the Cosmos distribution pool fed by
// the protocol's minimum inflation (which cannot be set to zero), not deferred delegation rewards.

/** One page of settlements across every validator the address delegates to, newest first. */
export const DELEGATION_SETTLEMENTS = /* GraphQL */ `
  query delegationSettlements($validators: [String!], $limit: Int!, $offset: Int!) {
    eventValidatorRewardDistributions(
      first: $limit
      offset: $offset
      orderBy: BLOCK_ID_DESC
      filter: { validatorOperatorAddress: { in: $validators } }
    ) {
      totalCount
      nodes {
        id
        blockId
        sessionEndBlockHeight
        validatorOperatorAddress
        commissionRate
        poolShareAmount
        commissionAmount
        delegatorsRewardAmount
        totalDelegatedStakeAmount
        numDelegators
        block {
          id
          timestamp
        }
      }
    }
  }
`;

/**
 * What the address received over a time window, per validator, in ONE round trip — from the money
 * catalog, not derived here:
 *
 *   - `income` (get_delegator_income): the exact amount the chain paid this delegator at each
 *     settlement, from the delegations it held at that height. No current-stake approximation.
 *     `validator_operator` '' is income the catalog could not attribute to one validator (replayed
 *     heights 288,180–788,944 only); it counts in the total.
 *   - `pools` (get_validator_rewards, every validator — tens of rows): each validator's delegator
 *     pool and settlement count over the same window, for the per-validator detail. Every validator,
 *     not just the current delegations, because the income can come from validators since left.
 *
 * Both raise for a range the catalog does not cover; see trailingRange in lib/data/window.ts.
 */
export const DELEGATION_WINDOW = /* GraphQL */ `
  query delegationWindow($delegators: [String], $rangeStart: Datetime!, $rangeEnd: Datetime!) {
    income: getDelegatorIncomeJson(delegators: $delegators, rangeStart: $rangeStart, rangeEnd: $rangeEnd, byValidator: true)
    pools: getValidatorRewardsJson(validators: null, rangeStart: $rangeStart, rangeEnd: $rangeEnd)
  }
`;
