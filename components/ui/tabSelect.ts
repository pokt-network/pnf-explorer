// Tab selection shared by the client `Tabs` and the server views that render only the active panel.
// Kept out of Tabs.tsx because a 'use client' module's exports can't be called on the server.

/** Slug for the shareable `?tab=` value, e.g. "Rev-share" → "rev-share", "Delegated Gateways" → "delegated-gateways". */
export function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

/** The tab a `?tab=` value selects (a tab's `key` or its slugified label); absent/unknown → `initial`, then the first tab. */
export function selectTab(tabs: readonly { key: string; label: string }[], requested: string | null | undefined, initial?: string): string | undefined {
  const matched = requested
    ? tabs.find((t) => t.key === requested || slugify(t.label) === slugify(requested))?.key
    : undefined;
  return matched ?? initial ?? tabs[0]?.key;
}
