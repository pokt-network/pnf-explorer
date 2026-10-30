'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useSyncExternalStore } from 'react';

// The Morse archive pages its lists by keyset: each page hands back an opaque cursor for the next one, and there is no
// page number, no total and no way back. So the way back is remembered here: following "Older" records, under the
// cursor it leads to, the cursor it left and that page's number. A later "Newer" on that page reads it back. The record
// lives in sessionStorage (this tab, any reload), keyed by the list's path and its other params as well, because a
// cursor is only valid for its own listing and filters. A deep link to a cursor nobody walked to has no record: it
// offers "First" instead of "Newer", and no page number.

const STORE = 'morse-pager';

type Trail = Record<string, { prev: string | null; page: number | null }>;

function readRaw(): string {
  try {
    return sessionStorage.getItem(STORE) ?? '{}';
  } catch {
    return '{}';
  }
}

function readTrail(raw: string): Trail {
  try {
    return JSON.parse(raw) as Trail;
  } catch {
    return {};
  }
}

function writeTrail(trail: Trail) {
  try {
    // A long walk stays bounded: keep the newest 500 steps.
    const entries = Object.entries(trail);
    sessionStorage.setItem(STORE, JSON.stringify(Object.fromEntries(entries.slice(-500))));
  } catch {
    /* storage unavailable: "Newer" falls back to "First" */
  }
}

const subscribe = () => () => {};

export function CursorPager({
  cursor,
  nextCursor,
  pageSize,
  param = 'cursor',
}: {
  /** The cursor this page was read with; undefined on the first page. */
  cursor?: string;
  nextCursor: string | null;
  pageSize: number;
  /** The URL param holding this list's cursor (detail-page tabs each use their own). */
  param?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  // '{}' on the server and in the first client render, then the tab's record: no hydration mismatch.
  const raw = useSyncExternalStore(subscribe, readRaw, () => '{}');

  const rest = new URLSearchParams(sp.toString());
  rest.delete(param);
  rest.delete('tab');
  const keyOf = (c: string) => `${pathname}?${rest.toString()}#${param}=${c}`;

  const here = cursor ? readTrail(raw)[keyOf(cursor)] : undefined;
  const page = cursor ? here?.page ?? null : 1;

  function go(c: string | null) {
    const params = new URLSearchParams(sp.toString());
    if (c) params.set(param, c);
    else params.delete(param);
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: true });
  }

  function older() {
    if (!nextCursor) return;
    const trail = readTrail(readRaw());
    // delete-then-set moves a revisited step to the end, so writeTrail's bound drops the oldest walks first
    delete trail[keyOf(nextCursor)];
    trail[keyOf(nextCursor)] = { prev: cursor ?? null, page: page != null ? page + 1 : null };
    writeTrail(trail);
    go(nextCursor);
  }

  return (
    <div className="pager">
      <span>{page ? `Page ${page.toLocaleString()} · ${pageSize} per page` : `${pageSize} per page`}</span>
      <div className="pg">
        {cursor && !here ? (
          <button onClick={() => go(null)} aria-label="First page">
            « First
          </button>
        ) : (
          <button onClick={() => go(here?.prev ?? null)} disabled={!cursor} aria-label="Newer page">
            ‹ Newer
          </button>
        )}
        <button onClick={older} disabled={!nextCursor} aria-label="Older page">
          Older ›
        </button>
      </div>
    </div>
  );
}
