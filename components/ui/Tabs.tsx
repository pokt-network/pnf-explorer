'use client';

import { useState } from 'react';

export interface TabDef {
  key: string;
  label: string;
  badge?: number | string;
  panel: React.ReactNode;
}

/**
 * Underline-style tabs (§8.5). Panels are server-rendered and passed in; all are mounted
 * and toggled with `hidden` so tab switches are instant (no refetch). role=tab/tabpanel.
 */
export function Tabs({ tabs, initial }: { tabs: TabDef[]; initial?: string }) {
  const [active, setActive] = useState(initial ?? tabs[0]?.key);

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
            onClick={() => setActive(t.key)}
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
