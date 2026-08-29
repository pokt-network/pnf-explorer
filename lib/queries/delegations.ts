// Staking-delegation queries (address page, `?as=delegation`).
//
// The staking delegations themselves are NOT indexed — there is no Delegation entity in the
// schema (`MsgDelegateToGateway` is the unrelated app→gateway delegation). Delegations and
// pending rewards are therefore always-LCD, exactly like the validator Delegators tab (§2).
//
// What the indexer DOES have is the realised payout: every settlement that credits a staking
// delegator lands as a module→account transfer with opReason TLM_RELAY_BURN_EQUALS_MINT_DELEGATOR_RD
// and recipientId = the delegator's pokt1 address. That is exact, on-chain money received — not a
// pro-rata estimate — so it is what the tab lists and what every headline figure is computed from.
//
// PERFORMANCE (probed live 2026-08-29): filtering `modToAcctTransfers` by recipientId ALONE times
// out server-side ("canceling statement due to statement timeout"), the same trap the rev-share
// income query hit. Adding opReason to the filter makes it index-backed and sub-second. Every query
// below therefore always carries BOTH predicates — never drop the opReason.

/** The delegator payout op-reason. Both queries filter on it; see the perf note above. */
export const DELEGATOR_RD = 'TLM_RELAY_BURN_EQUALS_MINT_DELEGATOR_RD';

/** One page of realised payouts, newest first, plus the lifetime count/sum for the header. */
export const DELEGATION_PAYOUTS = /* GraphQL */ `
  query delegationPayouts($address: String!, $limit: Int!, $offset: Int!) {
    modToAcctTransfers(
      first: $limit
      offset: $offset
      orderBy: BLOCK_ID_DESC
      filter: {
        recipientId: { equalTo: $address }
        opReason: { equalTo: TLM_RELAY_BURN_EQUALS_MINT_DELEGATOR_RD }
      }
    ) {
      totalCount
      aggregates {
        sum {
          amount
        }
      }
      nodes {
        id
        amount
        denom
        blockId
        block {
          id
          timestamp
        }
      }
    }
  }
`;

/**
 * Lifetime total + the trailing-window total in one round trip.
 *
 * `windowStartBlock` is resolved from a real block timestamp (see DELEGATION_WINDOW_BLOCK) rather
 * than derived from an assumed block time — Shannon's ~60s is a nominal, not a guarantee, and an
 * APR is too sensitive to the window length to rest on an assumption.
 */
export const DELEGATION_EARNINGS = /* GraphQL */ `
  query delegationEarnings($address: String!, $windowStartBlock: BigFloat!) {
    lifetime: modToAcctTransfers(
      filter: {
        recipientId: { equalTo: $address }
        opReason: { equalTo: TLM_RELAY_BURN_EQUALS_MINT_DELEGATOR_RD }
      }
    ) {
      totalCount
      aggregates {
        sum {
          amount
        }
      }
    }
    window: modToAcctTransfers(
      filter: {
        recipientId: { equalTo: $address }
        opReason: { equalTo: TLM_RELAY_BURN_EQUALS_MINT_DELEGATOR_RD }
        blockId: { greaterThanOrEqualTo: $windowStartBlock }
      }
    ) {
      totalCount
      aggregates {
        sum {
          amount
        }
      }
    }
    first: modToAcctTransfers(
      first: 1
      orderBy: BLOCK_ID_ASC
      filter: {
        recipientId: { equalTo: $address }
        opReason: { equalTo: TLM_RELAY_BURN_EQUALS_MINT_DELEGATOR_RD }
      }
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

/** Newest block at or before a wall-clock cutoff — turns "30 days ago" into a real block height. */
export const DELEGATION_WINDOW_BLOCK = /* GraphQL */ `
  query delegationWindowBlock($cutoff: Datetime!) {
    blocks(first: 1, orderBy: ID_DESC, filter: { timestamp: { lessThanOrEqualTo: $cutoff } }) {
      nodes {
        id
        timestamp
      }
    }
  }
`;
