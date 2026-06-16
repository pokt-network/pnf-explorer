'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useNetwork } from '@/lib/network-context';
import { NETWORK_LIST, netHref, type NetworkId } from '@/lib/networks';

// Mainnet/betanet switcher (AppBar, between the live badge and the theme toggle). Selecting a
// network navigates to that network's HOME — a full repaint with the new chain's data (ids and
// heights don't map across chains, so staying on a detail page would 404).
const DOT: Record<NetworkId, string> = {
  main: 'var(--mint)',
  beta: 'var(--gold)',
};

export function NetworkSwitcher() {
  const network = useNetwork();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const active = NETWORK_LIST.find((n) => n.id === network) ?? NETWORK_LIST[0];

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function select(id: NetworkId) {
    setOpen(false);
    if (id === network) return;
    router.push(netHref(id, '/'));
  }

  return (
    <div className="netswitch" ref={ref}>
      <button
        type="button"
        className="netswitch-btn"
        aria-label={`Network: ${active.label}. Switch network`}
        aria-haspopup="listbox"
        aria-expanded={open}
        title="Switch network"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="dot" style={{ background: DOT[active.id] }} />
        <span className="lbl">{active.short}</span>
        <svg className="chev" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open ? (
        <div className="navmenu-pop netswitch-pop" role="listbox" aria-label="Networks">
          <div className="navmenu-heading">Network</div>
          {NETWORK_LIST.map((n) => (
            <button
              key={n.id}
              type="button"
              role="option"
              aria-selected={n.id === network}
              className={`netswitch-item${n.id === network ? ' active' : ''}`}
              onClick={() => select(n.id)}
            >
              <span className="dot" style={{ background: DOT[n.id] }} />
              <span className="nm">{n.label}</span>
              {n.id === network ? <span className="chk">✓</span> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
