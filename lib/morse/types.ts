// Response shapes of the Morse archive API, transcribed from its contract (pokt-morse-api api/openapi.yaml, served live
// at /openapi.json). Only fields the contract lists — never invent one. Amounts are uPOKT as exact decimal strings,
// times RFC 3339 UTC, addresses 40-hex lowercase, hashes 64-hex uppercase.

/** A list page: keyset-paginated; `next_cursor` is opaque and null on the last page. */
export interface MorsePage<T> {
  items: T[];
  next_cursor: string | null;
}

/** Morse stake status as the list filters spell it; detail records carry the number (0/1/2). */
export type MorseStakeStatus = 'unstaked' | 'unstaking' | 'staked';

export const MORSE_TX_TYPES = [
  'send',
  'claim',
  'proof',
  'stake_validator',
  'begin_unstake_validator',
  'unjail_validator',
  'app_stake',
  'app_begin_unstake',
  'dao_tranfer',
  'change_param',
  'upgrade',
] as const;
/** `dao_tranfer` is spelled as stored on chain. */
export type MorseTxType = (typeof MORSE_TX_TYPES)[number];

export interface MorseBlockSummary {
  height: number;
  time: string | null;
  /** Minutes since the previous block (Morse targeted 15). */
  took?: number;
  producer: string;
  producer_service_url?: string | null;
  total_txs?: number;
  total_nodes?: number;
  total_relays_completed?: number;
  total_size?: number;
  block_size?: number;
  state_size?: number;
  nodes_jailed_staked?: number;
  nodes_unjailed_staked?: number;
  nodes_unjailed_unstaking?: number;
  apps_staked?: number;
  apps_unstaking?: number;
}

export interface MorseBlock extends MorseBlockSummary {
  total_good_txs?: number;
  total_bad_txs?: number;
  total_apps?: number;
  total_accounts?: number;
  total_challenges_completed?: number;
  total_minted?: number;
  supported_block_chains?: string[] | null;
  fee_multiplier?: number;
  token_multiplier?: number;
  node_earning_multiplier?: number;
  proposer_earning_multiplier?: number;
  dao_earning_multiplier?: number;
  block_per_session?: number;
  nodes_jailed_staked_tokens?: string | null;
  nodes_unjailed_staked_tokens?: string | null;
  nodes_unjailed_unstaking_tokens?: string | null;
  total_unstaked_nodes?: number;
  apps_staked_tokens?: string | null;
  apps_unstaking_tokens?: string | null;
  total_unstaked_apps?: number;
  verified?: boolean;
}

export interface MorseDelegator {
  address?: string;
  share?: number;
}

export interface MorseTxStake {
  chains?: string[] | null;
  output_address?: string;
  address?: string;
  service_url?: string;
  tokens?: string | null;
  reward_delegators?: MorseDelegator[] | null;
}

export interface MorseTxUpgrade {
  height?: number;
  version?: string;
  features?: string[] | null;
}

export interface MorseTxAppStake {
  tokens?: string | null;
  chains?: string[] | null;
  migrated_to?: string;
}

export interface MorseRewardSplit {
  total?: string | null;
  total_reward?: string | null;
  total_fees?: string | null;
  returned_fees?: string | null;
  operator?: string | null;
  custodian?: string | null;
  dao?: string | null;
  proposer?: string | null;
  total_delegator_rewards?: string | null;
  custodian_address?: string;
  chain_rttm?: number;
  chain_rttm_source?: string;
  service_multiplier?: number;
  computed_units?: number;
  node_base_multiplier?: number;
  node_multiplier?: number;
  delegators?: { address?: string; amount?: string | null; share?: number }[] | null;
}

export interface MorseTx {
  hash: string;
  /** 0 for a pending tx (seen in the mempool, never in a block). */
  height: number;
  index?: number;
  block_time: string | null;
  type: string;
  from_address?: string;
  to_address?: string;
  amount?: string | null;
  total_fee?: string | null;
  // `total_pokt` is left out on purpose: the contract calls it uPOKT but the API serves a POKT decimal ("0.016614"
  // for a 16,614 uPOKT reward). A proof's reward is read from reward_split.total_reward instead.
  total_proof?: number;
  /** 0 is success; -1 on a pending tx. */
  result_code?: number;
  pending?: boolean;
  memo?: string;
  chain?: string;
  app_public_key?: string;
  claim_tx_hash?: string;
  session_height?: number;
  expiration_height?: number;
  action?: string;
  change_param_key?: string;
  change_param_value?: string;
  /** Filled only by the detail endpoint. */
  change_param_prev_value?: string;
  stake?: MorseTxStake | null;
  upgrade?: MorseTxUpgrade | null;
  app_stake?: MorseTxAppStake | null;
  reward_split?: MorseRewardSplit | null;
}

export interface MorseNode {
  address: string;
  public_key?: string;
  output_address?: string;
  /** 0 unstaked, 1 unstaking, 2 staked. */
  status: number;
  jailed?: boolean;
  validator?: boolean;
  producer?: boolean;
  tokens?: string | null;
  balance?: string | null;
  output_balance?: string | null;
  stake_weight?: number | null;
  service_url?: string;
  service_domain?: string;
  chains?: string[] | null;
  /** True when the output address is the node address itself. */
  custodial?: boolean;
  chains_history?: { chain?: string; relays?: number }[];
  reward_delegators?: MorseDelegator[] | null;
  version?: string;
  height?: number;
  start_height?: number;
  block_time?: string | null;
  unstaking_time?: string | null;
  jailed_until?: string | null;
  jailed_blocks_counter?: number;
  missed_signing_blocks_counter?: number;
  missing_blocks?: number;
}

export interface MorseAppMigration {
  address?: string;
  chains?: string[] | null;
  height?: number;
  tokens?: string | null;
  block_time?: string | null;
}

export interface MorseApp {
  address: string;
  public_key?: string;
  /** 0 unstaked, 1 unstaking, 2 staked. */
  status: number;
  chains?: string[] | null;
  tokens?: string | null;
  balance?: string | null;
  max_relays?: number;
  gateway_id?: number;
  height?: number;
  block_time?: string | null;
  unstaking_time?: string | null;
  migrated_from?: MorseAppMigration | null;
  migrated_to?: MorseAppMigration | null;
}

export interface MorseAccount {
  address: string;
  public_key?: string;
  amount?: string | null;
  height?: number;
  block_time?: string | null;
}

export interface MorseTransfer {
  tx_hash: string;
  height?: number;
  block_time?: string | null;
  from_address?: string;
  to_address?: string;
  amount?: string | null;
  fee?: string | null;
  memo?: string;
  tx_result_code?: number;
  pending?: boolean;
  /** `out` when the listed address sent the value. */
  flow: 'in' | 'out';
}

export type MorseEntity = 'block' | 'tx' | 'node' | 'app' | 'account';

export interface MorseSearchHit {
  entity: MorseEntity;
  hash?: string;
  address?: string;
  height?: number;
  public_key?: string;
  service_domain?: string;
  service_url?: string;
}
