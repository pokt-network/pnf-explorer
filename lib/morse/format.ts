import { toDate } from '@/lib/time';
import type { MorseStakeStatus } from './types';

// Display helpers for the Morse archive. Amounts still go through lib/format (formatPokt etc.), the one upokt→POKT util.

/** A Morse record's numeric stake status (0/1/2) as the label StakeStatusPill takes. */
export function morseStakeLabel(status: number | null | undefined): 'Staked' | 'Unstaking' | 'Unstaked' | null {
  switch (status) {
    case 2:
      return 'Staked';
    case 1:
      return 'Unstaking';
    case 0:
      return 'Unstaked';
    default:
      return null;
  }
}

/** A `?status=` value, if it is one of the API's filter values. */
export function parseMorseStatus(v: string | undefined): MorseStakeStatus | undefined {
  return v === 'staked' || v === 'unstaking' || v === 'unstaked' ? v : undefined;
}

/** The stake-status filter chips of the node and app lists ('' = all). */
export const MORSE_STATUS_OPTIONS = [
  { value: '', label: 'All' },
  { value: 'staked', label: 'Staked' },
  { value: 'unstaking', label: 'Unstaking' },
  { value: 'unstaked', label: 'Unstaked' },
];

/** A `?chain=` value: a Morse relay chain id is 4 hex, written uppercase on chain. */
export function parseMorseChain(v: string | undefined): string | undefined {
  return v && /^[0-9a-fA-F]{4}$/.test(v) ? v.toUpperCase() : undefined;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * "Jun-03-2025 16:26" (UTC). The archive is a year or more old, so a relative "514d ago" says less than the date: lists
 * show this, with absoluteUtc on hover.
 */
export function utcShort(input: string | null | undefined): string {
  const d = toDate(input);
  if (!d) return '—';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${MONTHS[d.getUTCMonth()]}-${p(d.getUTCDate())}-${d.getUTCFullYear()} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}

/** A block's `took` (minutes since the previous block) as "13.8 min". */
export function formatTook(minutes: number | null | undefined): string {
  return minutes == null ? '—' : `${minutes.toFixed(1)} min`;
}

/** Human label for a Morse tx type, e.g. "stake_validator" → "Stake Node". */
const TX_TYPE_LABEL: Record<string, string> = {
  send: 'Send',
  claim: 'Claim',
  proof: 'Proof',
  stake_validator: 'Stake Node',
  begin_unstake_validator: 'Unstake Node',
  unjail_validator: 'Unjail Node',
  app_stake: 'Stake App',
  app_begin_unstake: 'Unstake App',
  dao_tranfer: 'DAO Transfer',
  change_param: 'Change Param',
  upgrade: 'Upgrade',
};

export function morseTxTypeLabel(type: string): string {
  return TX_TYPE_LABEL[type] ?? type;
}

/** Bytes as "1.8 MB" / "52.0 KB". */
export function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null) return '—';
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

/** A `?cursor=` value worth sending: the API caps cursors at 256 bytes and 400s anything else it can't decode. */
export function parseCursor(v: string | undefined): string | undefined {
  return v && v.length <= 256 && /^[A-Za-z0-9_-]+$/.test(v) ? v : undefined;
}
