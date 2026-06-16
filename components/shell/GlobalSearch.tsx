'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { gqlFetch } from '@/lib/graphql';
import { useNetwork } from '@/lib/network-context';
import { netHref } from '@/lib/networks';
import { SEARCH_BY_HASH, SEARCH_SERVICES } from '@/lib/queries/search';

const SearchIcon = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
);

const HEX64 = /^(0x)?[0-9a-fA-F]{64}$/;
const NUMERIC = /^\d+$/;

interface ServiceHint {
  id: string;
  name: string | null;
}

/**
 * Global search (§4). Unambiguous shapes route directly; a 64-hex hash is disambiguated via
 * searchByHash (block vs tx — tx preferred). Free text queries searchServices and shows a
 * dropdown of matches; each row links to /service/{id} and Enter jumps to the top match.
 */
export function GlobalSearch({ variant = 'mini' }: { variant?: 'mini' | 'hero' }) {
  const router = useRouter();
  const network = useNetwork();
  // Navigate within the active network (prefixes /beta on betanet, no-op on mainnet).
  const go = (path: string) => router.push(netHref(network, path));
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [services, setServices] = useState<ServiceHint[]>([]);
  const [open, setOpen] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  function classifyShape(q: string): 'valoper' | 'address' | 'numeric' | 'hex' | 'text' {
    if (q.startsWith('poktvaloper')) return 'valoper';
    if (q.startsWith('pokt1')) return 'address';
    if (NUMERIC.test(q)) return 'numeric';
    if (HEX64.test(q)) return 'hex';
    return 'text';
  }

  async function resolveAndRoute(raw: string) {
    const q = raw.trim();
    if (!q) return;
    const shape = classifyShape(q);
    setOpen(false);
    switch (shape) {
      case 'valoper':
        return go(`/validator/${q}`);
      case 'address':
        return go(`/account/${q}`);
      case 'numeric':
        return go(`/block/${q}`);
      case 'hex': {
        const hash = q.replace(/^0x/, '');
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
      case 'text':
        // Free text resolves to the best service match (if the dropdown surfaced any).
        if (services.length > 0) return go(`/service/${services[0].id}`);
        return;
    }
  }

  function onChange(v: string) {
    setValue(v);
    if (debounce.current) clearTimeout(debounce.current);
    const q = v.trim();
    if (q.length < 2 || classifyShape(q) !== 'text') {
      setServices([]);
      setOpen(false);
      return;
    }
    debounce.current = setTimeout(async () => {
      try {
        const data = await gqlFetch<{ services: { nodes: ServiceHint[] } }>(network, SEARCH_SERVICES, { text: q }, { cache: 'no-store' });
        setServices(data.services.nodes.slice(0, 6));
        setOpen(data.services.nodes.length > 0);
      } catch {
        setServices([]);
        setOpen(false);
      }
    }, 250);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    resolveAndRoute(value);
  }

  const dropdown =
    open && services.length > 0 ? (
      <div className="search-hints" role="listbox" aria-label="Service matches">
        <div className="search-hints-label">Services</div>
        {services.map((s) => (
          <div
            className="search-hint-row"
            role="option"
            aria-selected={false}
            key={s.id}
            // onMouseDown (not onClick) fires before the input's blur closes the dropdown.
            onMouseDown={(e) => {
              e.preventDefault();
              setOpen(false);
              go(`/service/${s.id}`);
            }}
          >
            <span className="svc-name">{s.name ?? s.id}</span>
            <span className="svc-id">{s.id}</span>
          </div>
        ))}
      </div>
    ) : null;

  if (variant === 'hero') {
    return (
      <form className="searchwrap" onSubmit={submit} role="search" onBlur={() => setTimeout(() => setOpen(false), 150)}>
        <svg className="s-icon" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          className="search"
          type="text"
          aria-label="Search the network"
          placeholder="Search by height / block hash / tx hash / pokt1… address / poktvaloper…"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete="off"
          spellCheck={false}
        />
        {busy ? <span className="search-busy">Resolving…</span> : null}
        {dropdown}
      </form>
    );
  }

  return (
    <form className="minisearch" onSubmit={submit} role="search" onBlur={() => setTimeout(() => setOpen(false), 150)}>
      {SearchIcon}
      <input
        type="text"
        aria-label="Search height, hash, or address"
        placeholder="Search height / hash / address…"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete="off"
        spellCheck={false}
      />
      {dropdown}
    </form>
  );
}
