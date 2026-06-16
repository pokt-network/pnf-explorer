'use client';

import { NetLink as Link } from '@/components/shell/NetLink';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useNetwork } from '@/lib/network-context';
import { netHref } from '@/lib/networks';

// Top-level navigation to every list/section. Lives to the right of the theme toggle in the AppBar.
const SECTIONS: { heading: string; links: { href: string; label: string }[] }[] = [
  {
    heading: 'Chain',
    links: [
      { href: '/blocks', label: 'Blocks' },
      { href: '/txs', label: 'Transactions' },
      { href: '/accounts', label: 'Accounts' },
    ],
  },
  {
    heading: 'Actors',
    links: [
      { href: '/validators', label: 'Validators' },
      { href: '/suppliers', label: 'Suppliers' },
      { href: '/services', label: 'Services' },
      { href: '/applications', label: 'Applications' },
      { href: '/gateways', label: 'Gateways' },
    ],
  },
  {
    heading: 'Network',
    links: [{ href: '/params', label: 'Parameters' }],
  },
];

export function NavMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const network = useNetwork();

  // Close on route change.
  useEffect(() => setOpen(false), [pathname]);

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

  return (
    <div className="navmenu" ref={ref}>
      <button
        type="button"
        className="iconbtn"
        aria-label="Menu"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <line x1="3" y1="6" x2="21" y2="6" />
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </svg>
      </button>
      {open ? (
        <div className="navmenu-pop" role="menu">
          {SECTIONS.map((sec) => (
            <div className="navmenu-section" key={sec.heading}>
              <div className="navmenu-heading">{sec.heading}</div>
              {sec.links.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  role="menuitem"
                  className={`navmenu-item${pathname === netHref(network, l.href) ? ' active' : ''}`}
                >
                  {l.label}
                </Link>
              ))}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
