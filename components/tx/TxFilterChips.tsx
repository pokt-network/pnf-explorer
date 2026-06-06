'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { TxFilterKey } from '@/lib/data/transactions';

const CHIPS: { key: TxFilterKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'success', label: 'Success' },
  { key: 'failed', label: 'Failed' },
  { key: 'msgsend', label: 'MsgSend' },
  { key: 'msgclaim', label: 'MsgClaim' },
  { key: 'msgproof', label: 'MsgProof' },
];

/**
 * Tx-type / status filter chips. Updates the URL `?type=` (and resets `page`) so the server
 * re-renders with the matching TransactionFilter — no client-side data fetching (§4).
 */
export function TxFilterChips({ active }: { active: TxFilterKey }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  function select(key: TxFilterKey) {
    if (key === active) return;
    const params = new URLSearchParams(sp.toString());
    params.delete('page');
    if (key === 'all') params.delete('type');
    else params.set('type', key);
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  return (
    <div className="chips">
      {CHIPS.map((c) => (
        <button key={c.key} className={`chip${c.key === active ? ' active' : ''}`} onClick={() => select(c.key)} aria-pressed={c.key === active}>
          {c.label}
        </button>
      ))}
    </div>
  );
}
