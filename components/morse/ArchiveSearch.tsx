'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { MORSE_FINAL_HEIGHT, morseAddress, morseHash, morseHeight, morseHitHref, searchMorse } from '@/lib/morse/api';
import { formatNumber } from '@/lib/format';
import { compactQuery, heightDigits, isShortened } from '@/lib/search';

const SearchIcon = ({ size, className }: { size: number; className?: string }) => (
  <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
);

/**
 * The Morse archive's global search. A height routes straight to its block. A 40-hex address or a 64-hex hash / public
 * key asks the archive's /v1/search (from the browser — CORS is open) which entity it is: an address can be a node, an
 * app or a plain account, and 64 hex can be a tx hash or a node/app public key. A pokt1… address belongs to Shannon, so
 * it opens on the mainnet explorer.
 */
export function ArchiveSearch({ variant = 'mini' }: { variant?: 'mini' | 'hero' }) {
  const router = useRouter();
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function resolve(raw: string) {
    // Spaces and invisible characters a paste brings are dropped before matching (lib/search.ts).
    const q = compactQuery(raw);
    setNote(null);
    if (!q) return;
    if (isShortened(q)) return setNote('That’s a shortened value. Copy the full hash or address.');
    if (/^pokt1/i.test(q)) return router.push(`/account/${q.toLowerCase()}`);
    const digits = heightDigits(q);
    if (digits) {
      const h = morseHeight(digits);
      if (h != null) return router.push(`/morse/block/${h}`);
      return setNote(`Morse blocks run from 1 to ${formatNumber(MORSE_FINAL_HEIGHT)}.`);
    }
    const address = morseAddress(q);
    const hash = morseHash(q);
    if (!address && !hash) return setNote('Enter a height, tx hash, address or public key.');
    setBusy(true);
    try {
      const hits = await searchMorse(address ?? hash!);
      const href = hits.map(morseHitHref).find(Boolean);
      if (href) return router.push(href);
      // Nothing matched: the detail page renders the archive's not-found.
      router.push(address ? `/morse/account/${address}` : `/morse/tx/${hash}`);
    } catch {
      // The archive's search failed (busy, rate limited): fall back on the shape alone.
      router.push(address ? `/morse/account/${address}` : `/morse/tx/${hash}`);
    } finally {
      setBusy(false);
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    resolve(value);
  }

  // A message under the box, in the global search's dropdown style: a tooltip alone went unseen.
  const noteBox = note ? (
    <div className="search-hints" role="status">
      <div className="search-hint-note">{note}</div>
    </div>
  ) : null;
  const searchButton = (size: number, className?: string) => (
    <button type="submit" className="search-go" aria-label="Search">
      <SearchIcon size={size} className={className} />
    </button>
  );

  if (variant === 'hero') {
    return (
      <form className="searchwrap" onSubmit={submit} role="search">
        {searchButton(19, 's-icon')}
        <input
          className="search"
          type="text"
          aria-label="Search the Morse archive"
          placeholder="Search by height / tx hash / address / public key"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setNote(null);
          }}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
        />
        {busy ? <span className="search-busy">Resolving…</span> : null}
        {noteBox}
      </form>
    );
  }

  return (
    <form className="minisearch" onSubmit={submit} role="search">
      {searchButton(16)}
      <input
        type="text"
        aria-label="Search the Morse archive"
        placeholder="Search Morse height / hash / address…"
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setNote(null);
        }}
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
      />
      {busy ? <span className="search-busy">Resolving…</span> : null}
      {noteBox}
    </form>
  );
}
