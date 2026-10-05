'use client';

import { useState, useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { TableSkeleton } from '@/components/ui/states';
import { slugify, selectTab } from './tabSelect';

export interface TabDef {
  key: string;
  label: string;
  badge?: number | string;
  /** `null` = deferred: the server renders it only while it is the `?tab=` (see below). */
  panel: React.ReactNode;
}

/**
 * Underline-style tabs (§8.5). Panels are server-rendered and passed in; all are mounted and toggled
 * with `hidden` so switches are instant (no refetch). role=tab/tabpanel.
 *
 * The active tab is shareable via `?tab=<slug>`: an incoming param (matched against either a tab's
 * `key` or its slugified label) selects the initial tab; clicking a tab updates the param through
 * `history.replaceState` — URL-bar only, no navigation or server refetch. Absent/unknown → `initial`
 * then the first tab (unchanged from before for paramless URLs).
 *
 * A tab whose `panel` is `null` is deferred: the server left it out because its query is expensive
 * and few visitors open it. Selecting it navigates to `?tab=<slug>`, so the server renders it then.
 */
export function Tabs({ tabs, initial }: { tabs: TabDef[]; initial?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [, startTransition] = useTransition();
  const [active, setActive] = useState(selectTab(tabs, useSearchParams().get('tab'), initial));

  function select(t: TabDef) {
    setActive(t.key);
    const sp = new URLSearchParams(window.location.search);
    sp.set('tab', slugify(t.label));
    if (t.panel === null) {
      startTransition(() => router.replace(`${pathname}?${sp.toString()}${window.location.hash}`, { scroll: false }));
      return;
    }
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
          {t.panel === null && active === t.key ? (
            <div className="card flush-top">
              <TableSkeleton rows={5} />
            </div>
          ) : (
            t.panel
          )}
        </div>
      ))}
    </>
  );
}
