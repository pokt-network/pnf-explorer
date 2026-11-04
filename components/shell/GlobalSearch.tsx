'use client';

import { useRouter } from 'next/navigation';
import { useId, useRef, useState } from 'react';
import { ENTITY, AccountIcon } from '@/components/ui/Icons';
import { withPrefix } from '@/lib/bech32';
import { gqlFetch } from '@/lib/graphql';
import { useNetwork } from '@/lib/network-context';
import { netHref } from '@/lib/networks';
import { SEARCH_BY_HASH, SEARCH_SERVICES } from '@/lib/queries/search';
import { compactQuery, heightDigits, isShortened, type SearchSuggestions, type Suggestion, type SuggestionIcon } from '@/lib/search';

const SearchIcon = ({ size, className }: { size: number; className?: string }) => (
  <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
);

const HEX64 = /^(0x)?[0-9a-f]{64}$/i;
const HEX40 = /^(0x)?[0-9a-f]{40}$/i;

interface ServiceHint {
  id: string;
  name: string | null;
}

type Shape =
  | { kind: 'valoper' | 'address' | 'numeric' | 'hex' | 'morse'; id: string }
  | { kind: 'text'; text: string };

/**
 * What a query is. Hashes, addresses and heights are matched with spaces and invisible characters removed
 * (lib/search.ts): pasted values carry them, and a value that matched nothing used to do nothing at all. Bech32 is
 * case-insensitive and written lowercase, so `POKT1…` is lowercased; a hash may come with `0x`/`0X`. 40 hex is a Morse
 * address, which the Morse archive holds.
 */
function classify(raw: string): Shape {
  const compact = compactQuery(raw);
  const lower = compact.toLowerCase();
  if (lower.startsWith('poktvaloper1')) return { kind: 'valoper', id: lower };
  if (lower.startsWith('pokt1')) return { kind: 'address', id: lower };
  const height = heightDigits(compact);
  if (height) return { kind: 'numeric', id: height };
  if (HEX64.test(compact)) return { kind: 'hex', id: compact.replace(/^0x/i, '') };
  if (HEX40.test(compact)) return { kind: 'morse', id: compact.replace(/^0x/i, '').toLowerCase() };
  return { kind: 'text', text: raw.trim() };
}

/**
 * True once the query is a whole value worth resolving into views: a checksummed address, a height, a full hash, or
 * two characters of service text. A half-typed address or hash is not sent, so /api/search (and the account roles
 * query behind it) runs once per value, not per keystroke.
 */
function isComplete(raw: string): boolean {
  if (isShortened(raw)) return false;
  const shape = classify(raw);
  switch (shape.kind) {
    case 'address':
      return withPrefix(shape.id, 'pokt') != null;
    case 'valoper':
      return withPrefix(shape.id, 'poktvaloper') != null;
    case 'text':
      return shape.text.length >= 2 && !/^pokt/i.test(shape.text);
    default:
      return true;
  }
}

const MorseIcon = { color: 'var(--text-secondary)', tint: 'rgba(142,154,163,.14)', Icon: AccountIcon };

function RowIcon({ icon }: { icon: SuggestionIcon }) {
  const { color, tint, Icon } = icon === 'morse' ? MorseIcon : ENTITY[icon];
  return (
    <span className="sg-ic" style={{ background: tint }}>
      <Icon size={13} stroke={color} />
    </span>
  );
}

/**
 * Global search (§4) with a lookahead. Once the box holds a whole value, /api/search resolves it into the views it can
 * open: every role an address holds (the account page's own role tabs), the tx and/or block a hash names, a height's
 * block, a Morse address's archive pages, matching services. They drop down as rows to click or pick with ↑/↓ and
 * Enter. Enter with no row picked opens the value's default view directly, as before: a hash is disambiguated via
 * searchByHash (tx preferred), an address opens on its most specific role. A query that resolves to nothing says so
 * under the box rather than leaving it looking dead.
 */
export function GlobalSearch({ variant = 'mini' }: { variant?: 'mini' | 'hero' }) {
  const router = useRouter();
  const network = useNetwork();
  const listId = useId();
  // Navigate within the active network (prefixes /beta on betanet, no-op on mainnet).
  const go = (path: string) => router.push(netHref(network, path));
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [looking, setLooking] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<SearchSuggestions | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inflight = useRef<AbortController | null>(null);

  const rows: Suggestion[] = suggestions?.groups.flatMap((g) => g.items) ?? [];

  function openRow(s: Suggestion) {
    setOpen(false);
    setActive(-1);
    if (s.absolute) router.push(s.href);
    else go(s.href);
  }

  async function findServices(text: string): Promise<ServiceHint[]> {
    const data = await gqlFetch<{ services: { nodes: ServiceHint[] } }>(network, SEARCH_SERVICES, { text }, { cache: 'no-store' });
    return data.services.nodes.slice(0, 6);
  }

  async function resolveAndRoute(raw: string) {
    if (!raw.trim()) return;
    setOpen(false);
    setNote(null);
    if (isShortened(raw)) {
      setNote('That’s a shortened value. Copy the full hash or address.');
      return;
    }
    const shape = classify(raw);
    switch (shape.kind) {
      case 'valoper':
        return go(`/validator/${shape.id}`);
      case 'address':
        return go(`/account/${shape.id}`);
      case 'numeric':
        return go(`/block/${shape.id}`);
      case 'morse':
        // The archive's account page forwards to the node or app holding the address.
        return router.push(`/morse/account/${shape.id}`);
      case 'hex': {
        const hash = shape.id;
        setBusy(true);
        try {
          const data = await gqlFetch<{ transaction: { id: string } | null; blocks: { nodes: { hash: string }[] } }>(
            network,
            SEARCH_BY_HASH,
            { hash: hash.toUpperCase() },
            { cache: 'no-store' },
          );
          // Disambiguation: prefer the tx if the hash resolves to both (§4).
          if (data.transaction) return go(`/tx/${hash}`);
          if (data.blocks.nodes.length) return go(`/block/${hash}`);
          return go(`/tx/${hash}`); // nothing matched → tx page renders not-found
        } catch {
          return go(`/tx/${hash}`);
        } finally {
          setBusy(false);
        }
      }
      case 'text': {
        // Free text resolves to the best service match: the dropdown's, or (Enter before it arrived) a lookup now.
        const shown = rows.find((r) => r.icon === 'service');
        if (shown) return openRow(shown);
        setBusy(true);
        let matches: ServiceHint[] = [];
        try {
          matches = await findServices(shape.text);
        } catch {
          /* no services: say so below */
        } finally {
          setBusy(false);
        }
        if (matches.length > 0) return go(`/service/${matches[0].id}`);
        setNote('No block, transaction, address, validator or service matches that.');
        return;
      }
    }
  }

  function onChange(v: string) {
    setValue(v);
    setNote(null);
    setActive(-1);
    if (debounce.current) clearTimeout(debounce.current);
    inflight.current?.abort();
    if (!isComplete(v)) {
      setSuggestions(null);
      setOpen(false);
      setLooking(false);
      return;
    }
    debounce.current = setTimeout(async () => {
      const ctrl = new AbortController();
      inflight.current = ctrl;
      setLooking(true);
      try {
        const res = await fetch(`/api/search?network=${network}&q=${encodeURIComponent(v)}`, { signal: ctrl.signal, cache: 'no-store' });
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as SearchSuggestions;
        setSuggestions(data);
        setOpen(data.groups.length > 0 || data.note != null);
      } catch {
        // Aborted by a newer keystroke, or the lookup failed: Enter still resolves the value directly.
        if (!ctrl.signal.aborted) {
          setSuggestions(null);
          setOpen(false);
        }
      } finally {
        if (inflight.current === ctrl) setLooking(false);
      }
    }, 250);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      setOpen(false);
      setActive(-1);
      return;
    }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    if (rows.length === 0) return;
    e.preventDefault();
    setOpen(true);
    const step = e.key === 'ArrowDown' ? 1 : -1;
    // Cycles through the rows and back to the input itself (-1: Enter opens the default view).
    setActive((i) => {
      const next = i + step;
      if (next < -1) return rows.length - 1;
      return next >= rows.length ? -1 : next;
    });
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (open && active >= 0 && rows[active]) return openRow(rows[active]);
    resolveAndRoute(value);
  }

  // Each group's first row index in `rows`, so ↑/↓ and the rows agree on positions.
  const starts = (suggestions?.groups ?? []).map((_, gi, gs) => gs.slice(0, gi).reduce((n, g) => n + g.items.length, 0));
  const dropdown = note ? (
    <div className="search-hints" role="status">
      <div className="search-hint-note">{note}</div>
    </div>
  ) : open && suggestions ? (
    <div className="search-hints" id={listId} role="listbox" aria-label="Views for this search">
      {suggestions.groups.map((g, gi) => (
        <div key={g.heading} role="group" aria-label={g.heading}>
          <div className="search-hints-label">{g.heading}</div>
          {g.items.map((s, si) => {
            const i = starts[gi] + si;
            return (
              <div
                className={`search-hint-row${i === active ? ' active' : ''}`}
                role="option"
                id={`${listId}-${i}`}
                aria-selected={i === active}
                key={`${s.href}-${s.label}`}
                onMouseEnter={() => setActive(i)}
                // onMouseDown (not onClick) fires before the input's blur closes the dropdown.
                onMouseDown={(e) => {
                  e.preventDefault();
                  openRow(s);
                }}
              >
                <RowIcon icon={s.icon} />
                <span className="svc-name">{s.label}</span>
                {s.hint ? <span className="svc-id">{s.hint}</span> : null}
              </div>
            );
          })}
        </div>
      ))}
      {suggestions.note ? <div className="search-hint-note">{suggestions.note}</div> : null}
    </div>
  ) : null;

  // The magnifier submits too: after a paste, clicking it is as natural as Enter.
  const searchButton = (size: number, className?: string) => (
    <button type="submit" className="search-go" aria-label="Search">
      <SearchIcon size={size} className={className} />
    </button>
  );

  const inputProps = {
    type: 'text',
    value,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value),
    onKeyDown,
    onFocus: () => {
      if (suggestions && value) setOpen(true);
    },
    role: 'combobox',
    'aria-expanded': open && rows.length > 0,
    'aria-controls': listId,
    'aria-autocomplete': 'list' as const,
    'aria-activedescendant': open && active >= 0 ? `${listId}-${active}` : undefined,
    autoComplete: 'off',
    autoCapitalize: 'off',
    spellCheck: false,
  };
  const status = busy || looking ? <span className="search-busy">Resolving…</span> : null;
  const onBlur = () => setTimeout(() => setOpen(false), 150);

  if (variant === 'hero') {
    return (
      <form className="searchwrap" onSubmit={submit} role="search" onBlur={onBlur}>
        {searchButton(19, 's-icon')}
        <input
          className="search"
          aria-label="Search the network"
          placeholder="Search by height / block hash / tx hash / pokt1… address / poktvaloper…"
          {...inputProps}
        />
        {status}
        {dropdown}
      </form>
    );
  }

  return (
    <form className="minisearch" onSubmit={submit} role="search" onBlur={onBlur}>
      {searchButton(16)}
      <input aria-label="Search height, hash, or address" placeholder="Search height / hash / address…" {...inputProps} />
      {status}
      {dropdown}
    </form>
  );
}
