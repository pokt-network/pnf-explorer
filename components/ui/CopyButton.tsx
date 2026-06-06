'use client';

import { useState } from 'react';

/** Copy-to-clipboard affordance shown next to full hashes/addresses (§8.5). */
export function CopyButton({ value, label }: { value: string; label?: string }) {
  const [done, setDone] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setDone(true);
      setTimeout(() => setDone(false), 1200);
    } catch {
      /* clipboard unavailable — no-op */
    }
  }

  return (
    <button className="copybtn" onClick={copy} aria-label={label ?? 'Copy to clipboard'} title={done ? 'Copied' : 'Copy'}>
      {done ? '✓' : '⧉'}
    </button>
  );
}
