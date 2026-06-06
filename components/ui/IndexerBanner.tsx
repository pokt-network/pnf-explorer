'use client';

import { useState } from 'react';
import { InfoIcon } from './Icons';

/**
 * Dismissible page-level notice shown when getUseRpcData() is true — data is served live
 * from RPC and may differ from the indexed view (§11). Distinct from the per-panel LCD
 * strip (§8.6.1), which is about always-LCD content regardless of indexer health.
 */
export function IndexerBanner({ lag }: { lag?: number | null }) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;
  return (
    <div className="fallback card flush-top" style={{ borderRadius: 'var(--radius-card)', marginBottom: 16, alignItems: 'center' }}>
      <InfoIcon size={17} stroke="var(--gold)" />
      <div className="ft" style={{ flex: 1 }}>
        <b>Serving live data from RPC</b>
        <p>
          The indexer is {lag != null && lag > 0 ? `behind head by ${lag} blocks` : 'currently behind or unavailable'}; this
          page is read directly from the chain and may differ from the indexed view.
        </p>
      </div>
      <button className="chip" onClick={() => setDismissed(true)} aria-label="Dismiss notice">
        Dismiss
      </button>
    </div>
  );
}
