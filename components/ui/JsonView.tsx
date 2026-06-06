'use client';

import type { CSSProperties } from 'react';
import ReactJsonView from '@uiw/react-json-view';

// Theme the viewer by mapping its --w-rjv-* CSS variables onto the app's design tokens. Those
// tokens already flip with the `data-theme` attribute, so the viewer auto-matches dark/light with
// no JS theme detection (and therefore no hydration flash). Unset vars fall back to lib defaults.
const THEME = {
  '--w-rjv-font-family': 'var(--mono)',
  '--w-rjv-background-color': 'transparent',
  '--w-rjv-color': 'var(--text-primary)',
  '--w-rjv-line-color': 'var(--border)',
  '--w-rjv-arrow-color': 'var(--text-tertiary)',
  '--w-rjv-info-color': 'var(--text-tertiary)',
  '--w-rjv-colon-color': 'var(--text-secondary)',
  '--w-rjv-brackets-color': 'var(--text-tertiary)',
  '--w-rjv-curlybraces-color': 'var(--text-tertiary)',
  '--w-rjv-quotes-color': 'var(--text-tertiary)',
  '--w-rjv-quotes-string-color': 'var(--mint)',
  '--w-rjv-key-string': 'var(--blue-soft)',
  '--w-rjv-key-number': 'var(--blue-soft)',
  '--w-rjv-type-string-color': 'var(--mint)',
  '--w-rjv-type-int-color': 'var(--gold)',
  '--w-rjv-type-float-color': 'var(--gold)',
  '--w-rjv-type-bigint-color': 'var(--gold)',
  '--w-rjv-type-boolean-color': 'var(--lavender)',
  '--w-rjv-type-date-color': 'var(--lavender)',
  '--w-rjv-type-url-color': 'var(--blue-soft)',
  '--w-rjv-type-null-color': 'var(--coral)',
  '--w-rjv-type-nan-color': 'var(--coral)',
  '--w-rjv-type-undefined-color': 'var(--coral)',
  '--w-rjv-copied-color': 'var(--text-tertiary)',
  '--w-rjv-copied-success-color': 'var(--mint)',
} as CSSProperties;

/**
 * Interactive JSON viewer (syntax highlighting, collapsible nodes — default open, per-node copy).
 * Non-objects fall back to plain text. Long strings (e.g. a proof blob) are shortened with an
 * inline expander so the tree stays scannable.
 */
export function JsonView({ data }: { data: unknown }) {
  if (data == null || typeof data !== 'object') {
    return <div className="jsonview jsonview-plain">{data == null ? '—' : String(data)}</div>;
  }
  return (
    <div className="jsonview">
      <ReactJsonView
        value={data as object}
        style={THEME}
        collapsed={false}
        displayDataTypes={false}
        displayObjectSize
        enableClipboard
        shortenTextAfterLength={160}
      />
    </div>
  );
}
