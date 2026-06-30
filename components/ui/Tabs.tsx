'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';

export interface TabDef {
  key: string;
  label: string;
  badge?: number | string;
  panel: React.ReactNode;
}

/** Slug for the shareable `?tab=` value, e.g. "Rev-share" → "rev-share", "Delegated Gateways" → "delegated-gateways". */
function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

/**
 * Underline-style tabs (§8.5). Panels are server-rendered and passed in; all are mounted and toggled
 * with `hidden` so switches are instant (no refetch). role=tab/tabpanel.
 *
 * The active tab is shareable via `?tab=<slug>`: an incoming param (matched against either a tab's
 * `key` or its slugified label) selects the initial tab; clicking a tab updates the param through
 * `history.replaceState` — URL-bar only, no navigation or server refetch. Absent/unknown → `initial`
 * then the first tab (unchanged from before for paramless URLs).
 */
export function Tabs({ tabs, initial }: { tabs: TabDef[]; initial?: string }) {
  const requested = useSearchParams().get('tab');
  const matched = requested
    ? tabs.find((t) => t.key === requested || slugify(t.label) === slugify(requested))?.key
    : undefined;
  const [active, setActive] = useState(matched ?? initial ?? tabs[0]?.key);

  function select(t: TabDef) {
    setActive(t.key);
    const sp = new URLSearchParams(window.location.search);
    sp.set('tab', slugify(t.label));
    window.history.replaceState(null, '', `${window.location.pathname}?${sp.toString()}${window.location.hash}`);
  }

  return (
    <>
      <div className="tabs" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.key}
            role="tab"
            id={`tab-${t.key}`}
            aria-selected={active === t.key}
            aria-controls={`panel-${t.key}`}
            className={active === t.key ? 'active' : ''}
            onClick={() => select(t)}
          >
            {t.label}
            {t.badge != null ? <span className="badge">{t.badge}</span> : null}
          </button>
        ))}
      </div>
      {tabs.map((t) => (
        <div key={t.key} role="tabpanel" id={`panel-${t.key}`} aria-labelledby={`tab-${t.key}`} hidden={active !== t.key}>
          {t.panel}
        </div>
      ))}
    </>
  );
}
