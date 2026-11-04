import { gqlFetch } from '@/lib/graphql';
import { withPrefix } from '@/lib/bech32';
import { getAccountProfile } from '@/lib/data/accounts';
import { getMorseSearch, morseHitHref } from '@/lib/morse/api';
import type { NetworkId } from '@/lib/networks';
import { SEARCH_BY_HASH, SEARCH_SERVICES } from '@/lib/queries/search';
import { heldRoles, ROLES, type RoleId } from '@/lib/roles';
import { compactQuery, heightDigits, type SearchSuggestions, type Suggestion, type SuggestionIcon } from '@/lib/search';
import { primaryMessage } from '@/lib/tx';
import { formatNumber, truncate } from '@/lib/format';

// The global search's lookahead (/api/search): what a COMPLETE query resolves to, as the views it can open. An
// address lists every role it holds, from the same heldRoles() the account page builds its role tabs from, so the
// dropdown and the page never disagree. A half-typed value resolves to nothing here: the caller only asks once a
// value has a complete shape, so the roles query is not run per keystroke.

const VALID_BECH32 = (s: string, hrp: string) => s.startsWith(`${hrp}1`) && withPrefix(s, hrp) != null;
const HEX64 = /^(0x)?[0-9a-f]{64}$/i;
const HEX40 = /^(0x)?[0-9a-f]{40}$/i;

const ROLE_ICON: Record<RoleId, SuggestionIcon> = {
  account: 'account',
  supplier: 'supplier',
  owner: 'supplier',
  application: 'application',
  gateway: 'gateway',
  validator: 'validator',
  delegation: 'validator',
  service: 'service',
  revshare: 'service',
};

async function addressViews(network: NetworkId, address: string): Promise<SearchSuggestions> {
  const profile = await getAccountProfile(network, address);
  const held = heldRoles(profile);
  const known = profile.account != null || held.length > 1;
  // Every view is linked with its role (?as=account included): a paramless URL opens on the most specific role, which
  // is what pressing Enter does; a row is a choice.
  const items: Suggestion[] = held.map(({ meta, hint, externalHref }) => ({
    label: meta.title,
    hint: meta.id === 'account' ? (known ? 'wallet' : 'no on-chain activity yet') : hint,
    href: externalHref ?? `/account/${address}?as=${meta.id}`,
    icon: ROLE_ICON[meta.id],
  }));
  return { groups: [{ heading: `Address ${truncate(address, 10, 6)} · ${items.length === 1 ? '1 view' : `${items.length} views`}`, items }] };
}

async function hashViews(network: NetworkId, hash: string): Promise<SearchSuggestions> {
  const data = await gqlFetch<{
    transaction: { id: string; code: number; amountOfMessages: unknown } | null;
    blocks: { nodes: { hash: string; height: string; totalTxs: number }[] };
  }>(network, SEARCH_BY_HASH, { hash: hash.toUpperCase() }, { cache: 'no-store' });
  const items: Suggestion[] = [];
  if (data.transaction) {
    const msg = primaryMessage(data.transaction.amountOfMessages);
    items.push({
      label: 'Transaction',
      hint: [msg?.label, Number(data.transaction.code) === 0 ? 'success' : 'failed'].filter(Boolean).join(' · '),
      href: `/tx/${hash}`,
      icon: 'tx',
    });
  }
  const block = data.blocks.nodes[0];
  if (block) {
    items.push({ label: `Block #${formatNumber(block.height)}`, hint: `${formatNumber(block.totalTxs)} txns`, href: `/block/${block.height}`, icon: 'block' });
  }
  if (items.length === 0) return { groups: [], note: 'No transaction or block has this hash on this network.' };
  return { groups: [{ heading: `Hash ${truncate(hash, 8, 6)}`, items }] };
}

/** A 40-hex address belongs to the halted Morse chain: its archive pages (node, app, account). */
async function morseViews(address: string): Promise<SearchSuggestions> {
  const hits = (await getMorseSearch(address)).filter((h) => h.address === address);
  const label: Record<string, string> = { node: 'Morse Node', app: 'Morse Application', account: 'Morse Account' };
  const items = hits
    .map((h): Suggestion | null => {
      const href = morseHitHref(h);
      return href ? { label: label[h.entity] ?? h.entity, hint: 'Morse Archive', href, absolute: true, icon: 'morse' } : null;
    })
    .filter((s): s is Suggestion => s != null);
  // The archive leaves out an account hit when a node or app has the address; the account page still exists.
  if (items.length > 0 && !hits.some((h) => h.entity === 'account')) {
    items.push({ label: label.account, hint: 'Morse Archive', href: `/morse/account/${address}`, absolute: true, icon: 'morse' });
  }
  if (items.length === 0) return { groups: [], note: 'No Morse node, app or account has this address.' };
  return { groups: [{ heading: `Morse address ${truncate(address, 8, 6)}`, items }] };
}

async function serviceViews(network: NetworkId, text: string): Promise<SearchSuggestions> {
  const data = await gqlFetch<{ services: { nodes: { id: string; name: string | null }[] } }>(network, SEARCH_SERVICES, { text }, { cache: 'no-store' });
  const items = data.services.nodes.slice(0, 6).map((s): Suggestion => ({ label: s.name ?? s.id, hint: s.id, href: `/service/${s.id}`, icon: 'service' }));
  return items.length ? { groups: [{ heading: 'Services', items }] } : { groups: [] };
}

/** The views `raw` resolves to on `network`; empty groups (and no note) while the value is incomplete. */
export async function resolveSuggestions(network: NetworkId, raw: string): Promise<SearchSuggestions> {
  const compact = compactQuery(raw);
  const lower = compact.toLowerCase();
  if (VALID_BECH32(lower, 'poktvaloper')) {
    return { groups: [{ heading: `Validator ${truncate(lower, 14, 6)}`, items: [{ label: ROLES.validator.title, hint: 'consensus', href: `/validator/${lower}`, icon: 'validator' }] }] };
  }
  if (VALID_BECH32(lower, 'pokt')) return addressViews(network, lower);
  const height = heightDigits(compact);
  if (height) return { groups: [{ heading: 'Height', items: [{ label: `Block #${formatNumber(height)}`, href: `/block/${height}`, icon: 'block' }] }] };
  if (HEX64.test(compact)) return hashViews(network, compact.replace(/^0x/i, '').toUpperCase());
  if (HEX40.test(compact)) return morseViews(compact.replace(/^0x/i, '').toLowerCase());
  const text = raw.trim();
  if (text.length >= 2 && !/^pokt/i.test(text)) return serviceViews(network, text);
  return { groups: [] };
}
