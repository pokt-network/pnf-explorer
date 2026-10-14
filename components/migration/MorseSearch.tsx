'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';

/**
 * Morse / Shannon address filter for the migration list. Updates the URL `?address=` (and resets `page`) so the
 * server re-renders with the matching filter — no client-side data fetching, like TxFilterChips.
 */
export function MorseSearch({ active }: { active?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [value, setValue] = useState(active ?? '');

  function apply(address: string) {
    const params = new URLSearchParams(sp.toString());
    params.delete('page');
    if (address) params.set('address', address);
    else params.delete('address');
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    apply(value.trim());
  }

  return (
    <form className="listsearch" onSubmit={submit} role="search">
      <input
        type="text"
        aria-label="Search by Morse or Shannon address"
        placeholder="Search by Morse address or Shannon (pokt1…) destination"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        autoComplete="off"
        spellCheck={false}
      />
      <button type="submit" className="chip" disabled={value.trim() === (active ?? '')}>
        Search
      </button>
      {active ? (
        <button
          type="button"
          className="chip"
          onClick={() => {
            setValue('');
            apply('');
          }}
        >
          Clear
        </button>
      ) : null}
    </form>
  );
}
